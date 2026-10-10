/**
 * Admin restaurant controller. List all restaurants (any status) + approve/reject.
 * Does NOT modify existing restaurantController or restaurantRoutes.
 */
import Restaurant from '../../models/Restaurant.js';
import FoodItem from '../../models/FoodItem.js';
import User from '../../models/User.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { sendSetupInvite } from '../../services/accountInviteService.js';
import {
  issueContactVerification,
  confirmContactVerification,
} from '../../services/contactVerificationService.js';
import { readIdentifier } from '../../utils/identifier.js';
import Settings from '../../models/Settings.js';
import { chargesFor } from '../../services/vendorChargesService.js';
import emailService from '../../services/emailService.js';
import {
  DOCUMENT_TYPES,
  deriveKycStatus,
  resolveDocumentType,
} from '../../utils/restaurantDocuments.js';

/**
 * GET /admin/restaurants - List all restaurants (including pending/rejected)
 * Enhanced with advanced filtering for vendor management
 */
export const getRestaurants = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status; // optional: pending | approved | rejected
    const kycStatus = req.query.kycStatus; // optional: pending | approved | rejected
    const isEnabled = req.query.isEnabled; // optional: true | false

    const filter = {};
    if (status && ['pending', 'approved', 'rejected'].includes(status)) {
      filter.status = status;
    }
    if (kycStatus && ['pending', 'approved', 'rejected'].includes(kycStatus)) {
      filter.kycStatus = kycStatus;
    }
    if (isEnabled !== undefined) {
      filter.isEnabled = isEnabled === 'true';
    }

    const [restaurants, total] = await Promise.all([
      Restaurant.find(filter)
        .populate('owner', 'name email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Restaurant.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      results: restaurants.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        restaurants,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch restaurants',
    });
  }
};

/**
 * PATCH /admin/restaurants/:id/approve - Approve or reject restaurant
 * Body: { status: 'approved' | 'rejected' } or { isApproved: boolean }
 */
/**
 * PATCH /admin/restaurants/:id/approve — decide a vendor application.
 *
 * Body: { status, reason? } where status is approved | rejected |
 * correction_requested | pending. `isApproved: true/false` is still accepted
 * from the older approvals screen.
 *
 * Every decision is recorded with its reason and who made it, because a vendor
 * told only "rejected" has nothing to act on, and an admin picking up someone
 * else's application needs to see what has already been asked for.
 */
export const approveRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    const { isApproved, reason } = req.body;

    // The approvals screen sends the decision as a boolean, which carries the
    // same meaning. Accepted as an alias so one caller isn't rejected purely
    // for naming the field differently.
    const status =
      req.body.status ??
      (isApproved === undefined
        ? undefined
        : isApproved
          ? 'approved'
          : 'rejected');

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    const allowed = ['approved', 'rejected', 'correction_requested', 'pending'];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Body must include status: one of ${allowed.join(', ')}`,
      });
    }

    /**
     * Turning a vendor away, or asking them to change something, has to say
     * why — it is the only thing they can act on, and the vendor console shows
     * it to them verbatim.
     */
    if ((status === 'rejected' || status === 'correction_requested') && !reason?.trim()) {
      return res.status(400).json({
        status: 'error',
        message:
          status === 'rejected'
            ? 'Give a reason for the rejection — the vendor is shown it.'
            : 'Say what needs correcting — the vendor is shown it.',
      });
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    restaurant.status = status;
    restaurant.statusReason = reason?.trim() || undefined;
    restaurant.statusChangedAt = new Date();
    restaurant.statusChangedBy = req.user?._id;

    // Approval is what puts a restaurant in front of customers; anything else
    // takes it back out.
    restaurant.isEnabled = status === 'approved';

    if (status === 'approved' && restaurant.kycStatus === 'under_review') {
      restaurant.kycStatus = 'approved';
    }

    restaurant.approvalHistory = restaurant.approvalHistory || [];
    restaurant.approvalHistory.push({
      status,
      reason: reason?.trim() || undefined,
      by: req.user?.name || req.user?.email || 'Admin',
      at: new Date(),
    });

    await restaurant.save();
    if (status === 'approved' && restaurant.owner?._id) {
      try {
        const { approveReferralInvite } = await import('../../services/referralService.js');
        await approveReferralInvite({ entityId: restaurant.owner._id, targetType: 'vendor', approved: true });
      } catch (referralError) { console.warn('Vendor referral reward skipped:', referralError.message); }
    }
    if (status === 'rejected' && restaurant.owner?._id) {
      try {
        const { approveReferralInvite } = await import('../../services/referralService.js');
        await approveReferralInvite({ entityId: restaurant.owner._id, targetType: 'vendor', approved: false });
      } catch (referralError) { console.warn('Vendor referral rejection update skipped:', referralError.message); }
    }
    await restaurant.populate('owner', 'name email phone');

    res.status(200).json({
      status: 'success',
      message: `Application ${status.replace('_', ' ')}`,
      data: {
        restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update restaurant',
    });
  }
};

/**
 * GET /admin/restaurants/:id - Get single restaurant (admin view, any status)
 */
export const getRestaurantById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    const restaurant = await Restaurant.findById(id).populate('owner', 'name email phone');
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    const foodItems = await FoodItem.find({ restaurantId: id }).select('-__v').lean();

    /*
     * Whether staff still have to confirm the contact details they typed for
     * this vendor. The restaurant cannot trade until they do, so the console
     * has to be able to see it and act on it. Only the state travels, never
     * the codes.
     */
    const owner = restaurant.owner
      ? await User.findById(restaurant.owner._id ?? restaurant.owner)
          .select('accountVerified contactVerification')
          .lean()
      : null;

    const contactVerification = owner?.contactVerification?.requiredBy
      ? {
          pending: owner.accountVerified !== true,
          emailVerified: owner.contactVerification.emailVerified === true,
          phoneVerified: owner.contactVerification.phoneVerified === true,
          expiresAt: owner.contactVerification.expiresAt || null,
        }
      : null;

    res.status(200).json({
      status: 'success',
      data: {
        restaurant: { ...restaurant.toObject(), contactVerification },
        foodItems,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch restaurant',
    });
  }
};

/**
 * PATCH /admin/restaurants/:id/kyc-status - Update KYC status
 * Body: { kycStatus: 'approved' | 'rejected' }
 */
export const updateKycStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { kycStatus } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    if (!kycStatus || !['approved', 'rejected'].includes(kycStatus)) {
      return res.status(400).json({
        status: 'error',
        message: 'Body must include kycStatus: "approved" or "rejected"',
      });
    }

    const updateData = { kycStatus };
    if (kycStatus === 'approved') {
      updateData.status = 'approved';
      updateData.isEnabled = true;
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('owner', 'name email phone');

    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: `KYC ${kycStatus}`,
      data: {
        restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update KYC status',
    });
  }
};

/**
 * PATCH /admin/restaurants/:id/commission - Update commission percentage
 * Body: { commissionPercent: Number }
 */
export const updateCommission = async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionPercent } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    if (commissionPercent === undefined || commissionPercent < 0 || commissionPercent > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Commission percent must be between 0 and 100',
      });
    }

    /**
     * Written to both places. Settlement reads the terms block once terms
     * have been set for a restaurant, so updating only the old field here
     * would leave an admin changing a number on screen and nothing changing
     * in the payout.
     */
    const existing = await Restaurant.findById(id).select('charges');
    const update = { commissionPercent };
    if (existing?.charges?.configured) {
      update['charges.commission.percentage'] = commissionPercent;
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true }
    ).populate('owner', 'name email phone');

    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Commission updated',
      data: {
        restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update commission',
    });
  }
};

/**
 * GET /admin/restaurants/:id/charges - What this restaurant is charged
 *
 * Returns the terms in force rather than the raw document, so a restaurant
 * whose terms have never been set shows the figures it is actually settled
 * on today instead of a row of defaults nobody chose.
 */
export const getCharges = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid restaurant ID' });
    }

    const restaurant = await Restaurant.findById(id).select(
      'name charges commissionPercent dailyPackagingFee'
    );
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
    }

    const settings = await Settings.getSettings();
    const terms = chargesFor(restaurant, {
      gstEnabled: settings?.taxConfiguration?.gst?.enabled,
      gstPercent: settings?.taxConfiguration?.gst?.enabled
        ? settings.taxConfiguration.gst.percentage
        : 0,
    });

    res.status(200).json({
      status: 'success',
      data: {
        restaurantId: restaurant._id,
        restaurantName: restaurant.name,
        charges: terms,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to load charges',
    });
  }
};

/**
 * PATCH /admin/restaurants/:id/charges - Set what this restaurant is charged
 * Body: { commission: { enabled, percentage }, gst: {...}, packing: { enabled, amount },
 *         packingGst: { enabled, percentage } }
 *
 * Saving here hands this restaurant its own terms for good: from this point
 * the platform-wide figures no longer apply to it, which is the whole point
 * of negotiating with a vendor separately.
 *
 * Only the sections present in the body are touched, so a screen that edits
 * commission alone cannot silently reset a packing fee it never showed.
 */
export const updateCharges = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid restaurant ID' });
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
    }

    /**
     * Terms move money, so a figure outside its range is treated as a typo
     * and refused rather than quietly clamped into something the admin did
     * not ask for.
     *
     * Every charge carries its own GST rate: the client's rule is that GST is
     * extra on everything, never folded into the figure beside it.
     */
    const SECTIONS = {
      commission: { value: ['percentage', 'amount'], max: { percentage: 100, amount: 100000 } },
      convenience: { value: ['percentage', 'amount'], max: { percentage: 100, amount: 100000 } },
      packing: { value: ['amount'], max: { amount: 10000 } },
      gst: { value: ['percentage'], max: { percentage: 30 } },
    };

    const update = { 'charges.configured': true };

    for (const [key, spec] of Object.entries(SECTIONS)) {
      const incoming = req.body?.[key];
      if (incoming === undefined) continue;

      if (incoming.enabled !== undefined) {
        update[`charges.${key}.enabled`] = Boolean(incoming.enabled);
      }

      if (incoming.mode !== undefined && key !== 'gst' && key !== 'packing') {
        if (!['percentage', 'fixed'].includes(incoming.mode)) {
          return res.status(400).json({
            status: 'error',
            message: `${key} must be charged as a percentage or a fixed amount.`,
          });
        }
        update[`charges.${key}.mode`] = incoming.mode;
      }

      for (const field of spec.value) {
        if (incoming[field] === undefined) continue;
        const value = Number(incoming[field]);
        const max = spec.max[field];
        if (!Number.isFinite(value) || value < 0 || value > max) {
          return res.status(400).json({
            status: 'error',
            message: `${key} ${field} must be a number between 0 and ${max}.`,
          });
        }
        update[`charges.${key}.${field}`] = value;
      }

      // GST on this charge, where the charge has one.
      if (key !== 'gst') {
        if (incoming.gstEnabled !== undefined) {
          update[`charges.${key}.gstEnabled`] = Boolean(incoming.gstEnabled);
        }
        if (incoming.gstPercentage !== undefined) {
          const rate = Number(incoming.gstPercentage);
          if (!Number.isFinite(rate) || rate < 0 || rate > 30) {
            return res.status(400).json({
              status: 'error',
              message: `GST on ${key} must be between 0 and 30 percent.`,
            });
          }
          update[`charges.${key}.gstPercentage`] = rate;
        }
      }
    }

    // The old single field is kept in step so anything still reading it -
    // reports, exports - does not disagree with the payout.
    if (update['charges.commission.percentage'] !== undefined) {
      update.commissionPercent = update['charges.commission.percentage'];
    }
    if (update['charges.packing.amount'] !== undefined) {
      update.dailyPackagingFee = update['charges.packing.amount'];
      update.packagingFeeUpdatedAt = new Date();
    }

    const saved = await Restaurant.findByIdAndUpdate(id, update, {
      new: true,
      runValidators: true,
    }).select('name charges commissionPercent dailyPackagingFee');

    res.status(200).json({
      status: 'success',
      message: 'Charges updated',
      data: {
        restaurantId: saved._id,
        restaurantName: saved.name,
        charges: chargesFor(saved),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update charges',
    });
  }
};

/**
 * PATCH /admin/restaurants/:id/status - Enable/Disable restaurant
 * Body: { isEnabled: Boolean }
 */
export const updateRestaurantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    // The console sends the state as a word — active/inactive/suspended — which
    // is what its status control offers. Mapped onto the boolean the model
    // stores; anything not recognised as live counts as switched off.
    const isEnabled =
      req.body.isEnabled ??
      (req.body.status === undefined
        ? undefined
        : ['active', 'approved', 'enabled', 'open'].includes(
            String(req.body.status).toLowerCase()
          ));

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    if (isEnabled === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Body must include isEnabled: true or false',
      });
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      id,
      { isEnabled },
      { new: true, runValidators: true }
    ).populate('owner', 'name email phone');

    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: `Restaurant ${isEnabled ? 'enabled' : 'disabled'}`,
      data: {
        restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update restaurant status',
    });
  }
};

/**
 * PATCH /admin/restaurants/:id/settlement-lock - Lock/Unlock settlement
 * Body: { settlementLock: Boolean }
 */
export const updateSettlementLock = async (req, res) => {
  try {
    const { id } = req.params;
    const { settlementLock } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    if (settlementLock === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'Body must include settlementLock: true or false',
      });
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      id,
      { settlementLock },
      { new: true, runValidators: true }
    ).populate('owner', 'name email phone');

    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: `Settlement ${settlementLock ? 'locked' : 'unlocked'}`,
      data: {
        restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update settlement lock',
    });
  }
};

/**
 * GET /admin/restaurants/:id/orders/stats - Get order statistics for a restaurant
 */
export const getRestaurantOrderStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    // Get order statistics
    const Order = mongoose.model('Order');
    
    const [totalOrders, pendingOrders, completedOrders, cancelledOrders] = await Promise.all([
      Order.countDocuments({ restaurantId: id }),
      Order.countDocuments({ restaurantId: id, status: 'Waiting for Confirmation' }),
      Order.countDocuments({ restaurantId: id, status: 'Delivered' }),
      Order.countDocuments({ restaurantId: id, status: 'Cancelled' }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        totalOrders,
        pendingOrders,
        completedOrders,
        cancelledOrders,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch order statistics',
    });
  }
};

/**
 * GET /admin/restaurants/:id/earnings - Get earnings data for a restaurant
 */
export const getRestaurantEarnings = async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    // Get earnings data from completed orders
    const Order = mongoose.model('Order');
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [totalEarningsResult, recentEarningsResult, monthlyEarningsResult] = await Promise.all([
      // Total earnings from all completed orders
      Order.aggregate([
        { $match: { restaurantId: new mongoose.Types.ObjectId(id), status: 'Delivered' } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      // Recent earnings (last 30 days)
      Order.aggregate([
        { $match: { restaurantId: new mongoose.Types.ObjectId(id), status: 'Delivered', createdAt: { $gte: thirtyDaysAgo } } },
        { $group: { _id: null, total: { $sum: '$total' } } }
      ]),
      // Monthly average (last 6 months)
      Order.aggregate([
        { $match: { restaurantId: new mongoose.Types.ObjectId(id), status: 'Delivered', createdAt: { $gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: { $month: '$createdAt' },
            total: { $sum: '$total' }
          }
        }
      ])
    ]);

    const totalEarnings = totalEarningsResult.length > 0 ? totalEarningsResult[0].total : 0;
    const recentEarnings = recentEarningsResult.length > 0 ? recentEarningsResult[0].total : 0;
    const monthlyAverage = monthlyEarningsResult.length > 0 
      ? monthlyEarningsResult.reduce((sum, month) => sum + month.total, 0) / monthlyEarningsResult.length 
      : 0;

    res.status(200).json({
      status: 'success',
      data: {
        totalEarnings,
        recentEarnings,
        monthlyAverage,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch earnings data',
    });
  }
};

/**
 * PUT /admin/restaurants/:id - Update restaurant details
 * Body: { name, phone, address, categories, commissionPercent, deliveryRadius, storeTimings, etc. }
 */
export const updateRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    // Remove sensitive fields that shouldn't be updated via this endpoint
    const { _id, owner, createdAt, updatedAt, ...allowedUpdates } = updateData;

    const restaurant = await Restaurant.findByIdAndUpdate(
      id,
      allowedUpdates,
      { new: true, runValidators: true }
    ).populate('owner', 'name email phone');

    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Restaurant updated successfully',
      data: {
        restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update restaurant',
    });
  }
};

/**
 * PATCH /admin/restaurants/:id/document-verification
 *
 * Two shapes, because two callers.
 *
 *   { documentType, status, note?, number?, expiryDate? }
 *     approves or rejects one document, records who did it and when, and
 *     recomputes the restaurant's KYC state from the file as a whole. This is
 *     what the console's Approve and Reject use, and it works for every
 *     document type rather than only the three that have a boolean.
 *
 *   { documentVerificationStatus: { fssaiVerified, … } }
 *     the original body, kept working for anything already sending it.
 */
export const updateDocumentVerification = async (req, res) => {
  try {
    const { id } = req.params;
    const { documentVerificationStatus, documentType, status, note, number, expiryDate } =
      req.body ?? {};

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    if (documentType) {
      return updateSingleDocument(req, res, {
        id,
        documentType,
        status,
        note,
        number,
        expiryDate,
      });
    }

    if (!documentVerificationStatus) {
      return res.status(400).json({
        status: 'error',
        message:
          'Send either documentType with a status, or documentVerificationStatus.',
      });
    }

    // Validate the document verification status object
    const allowedFields = ['fssaiVerified', 'gstVerified', 'bankVerified'];
    const updateData = {};
    
    for (const field of allowedFields) {
      if (documentVerificationStatus[field] !== undefined) {
        if (typeof documentVerificationStatus[field] !== 'boolean') {
          return res.status(400).json({
            status: 'error',
            message: `${field} must be a boolean value`,
          });
        }
        updateData[`documentVerificationStatus.${field}`] = documentVerificationStatus[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'At least one verification field must be provided',
      });
    }

    const restaurant = await Restaurant.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).populate('owner', 'name email phone');

    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Document verification status updated successfully',
      data: {
        restaurant,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update document verification status',
    });
  }
};

/**
 * Approve or reject one document, and let the restaurant's KYC state follow.
 *
 * The vendor status updating with the paperwork is the point: an admin who has
 * approved every required document should not then have to remember to set the
 * restaurant to approved by hand, and a rejection has to be visible to the
 * vendor as something to fix.
 */
async function updateSingleDocument(req, res, { id, documentType, status, note, number, expiryDate }) {
  const type = resolveDocumentType(documentType);
  if (!type) {
    return res.status(400).json({
      status: 'error',
      message:
        'Unknown document type. Allowed types: ' +
        DOCUMENT_TYPES.map((entry) => entry.key).join(', '),
    });
  }

  const allowed = ['pending', 'verified', 'rejected'];
  if (!allowed.includes(status)) {
    return res.status(400).json({
      status: 'error',
      message: `status must be one of: ${allowed.join(', ')}`,
    });
  }

  const restaurant = await Restaurant.findById(id);
  if (!restaurant) {
    return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
  }

  if (!restaurant.documentRecords) restaurant.documentRecords = new Map();
  const existing = restaurant.documentRecords.get(type.key);

  if (!existing?.url) {
    return res.status(400).json({
      status: 'error',
      message: `No ${type.label} has been uploaded to approve or reject.`,
    });
  }

  restaurant.documentRecords.set(type.key, {
    ...(existing.toObject ? existing.toObject() : existing),
    status,
    number: number?.trim() || existing.number,
    expiryDate: expiryDate ? new Date(expiryDate) : existing.expiryDate,
    // req.user is the signed-in admin; the name outlives the account better
    // than an id a future reader would have to resolve.
    verifiedBy: status === 'pending' ? undefined : req.user?.name || req.user?.email || 'Admin',
    verifiedAt: status === 'pending' ? undefined : new Date(),
    note: note?.trim() || undefined,
  });

  if (type.flag) {
    restaurant.set(`documentVerificationStatus.${type.flag}`, status === 'verified');
  }

  restaurant.kycStatus = deriveKycStatus(restaurant.documentRecords);
  await restaurant.save();
  await restaurant.populate('owner', 'name email phone');

  return res.status(200).json({
    status: 'success',
    message: `${type.label} marked ${status}`,
    data: {
      restaurant,
      kycStatus: restaurant.kycStatus,
      document: restaurant.documentRecords.get(type.key),
    },
  });
}

/**
 * PATCH /admin/restaurants/:id/documents/:documentType
 * Body: { number, uploadedAt, expiryDate, status, verifiedBy, note }
 *
 * Correct the details recorded against one document.
 *
 * Approving and rejecting already existed, but nothing could fix a mistyped
 * licence number, a wrong expiry, or a filing date entered from the wrong
 * paperwork - the only way to change any of it was to upload the file again,
 * which is not a correction, it is a new record.
 *
 * Only the fields sent are touched, so a form that submits one change does
 * not quietly blank the rest.
 */
export const updateRestaurantDocument = async (req, res) => {
  try {
    const { id, documentType } = req.params;
    const type = resolveDocumentType(documentType);
    if (!type) {
      return res.status(400).json({
        status: 'error',
        message:
          'Unknown document type. Allowed types: ' +
          DOCUMENT_TYPES.map((entry) => entry.key).join(', '),
      });
    }

    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
    }

    if (!restaurant.documentRecords) restaurant.documentRecords = new Map();
    const existing = restaurant.documentRecords.get(type.key);
    const current = existing?.toObject ? existing.toObject() : existing || {};

    const next = { ...current };
    const has = (field) => Object.prototype.hasOwnProperty.call(req.body, field);

    if (has('number')) next.number = String(req.body.number ?? '').trim() || undefined;
    if (has('note')) next.note = String(req.body.note ?? '').trim() || undefined;

    for (const field of ['uploadedAt', 'expiryDate']) {
      if (!has(field)) continue;
      const raw = req.body[field];
      if (!raw) {
        next[field] = undefined;
        continue;
      }
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({
          status: 'error',
          message: `${field} is not a date I can read`,
        });
      }
      next[field] = parsed;
    }

    if (next.uploadedAt && next.expiryDate && next.expiryDate < next.uploadedAt) {
      return res.status(400).json({
        status: 'error',
        message: 'The expiry date cannot be before the upload date',
      });
    }

    if (has('status')) {
      const status = String(req.body.status ?? '').toLowerCase();
      const allowed = ['pending', 'verified', 'rejected'];
      if (!allowed.includes(status)) {
        return res.status(400).json({
          status: 'error',
          message: `status must be one of: ${allowed.join(', ')}`,
        });
      }
      /*
       * A document cannot be verified when no document has been filed. The
       * restaurant's KYC state follows from these rows, so allowing it would
       * approve a vendor whose paperwork nobody has seen.
       */
      if (status === 'verified' && !current.url) {
        return res.status(400).json({
          status: 'error',
          message: `No ${type.label} has been uploaded, so it cannot be marked verified.`,
        });
      }
      next.status = status;

      if (status === 'pending') {
        next.verifiedBy = undefined;
        next.verifiedAt = undefined;
      } else if (!next.verifiedAt) {
        next.verifiedAt = new Date();
      }
    }

    // Who checked it. Named explicitly when someone else did the checking,
    // otherwise the admin making the change.
    if (has('verifiedBy')) {
      next.verifiedBy = String(req.body.verifiedBy ?? '').trim() || undefined;
    }
    if (!next.verifiedBy && next.status && next.status !== 'pending') {
      next.verifiedBy = req.user?.name || req.user?.email || 'Admin';
    }

    restaurant.documentRecords.set(type.key, next);

    if (type.flag) {
      restaurant.set(`documentVerificationStatus.${type.flag}`, next.status === 'verified');
    }
    restaurant.kycStatus = deriveKycStatus(restaurant.documentRecords);
    await restaurant.save();

    return res.status(200).json({
      status: 'success',
      message: `${type.label} updated`,
      data: {
        kycStatus: restaurant.kycStatus,
        document: restaurant.documentRecords.get(type.key),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not update the document',
    });
  }
};

/**
 * POST /admin/restaurants - Create a new vendor (user + restaurant)
 * Body: { name, username, email, phone, address, businessType, commissionPercent, status }
 */
export const createVendor = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      username,
      address,
      businessType,
      commissionPercent = 10,
      status = 'pending',
      foodLicenseNumber,
      foodType,
      approxDeliveryTime,
      storeCharge,
      vendorOtpEnabled,
      password,
      bankDetails,
    } = req.body;

    // -------------------------
    // Basic Validation
    // -------------------------
    if (!name || !email || !phone) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, email, and phone are required',
      });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid email address',
      });
    }

    // -------------------------
    // Check Existing Email
    // -------------------------
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        status: 'error',
        message: `Email '${email}' is already registered.`,
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    /**
     * The mobile number is a sign-in credential too, so it has to be unique
     * for the same reason the email is — two accounts on one number means a
     * sign-in by that number reaches whichever was created first, and the
     * other one's credentials look broken.
     */
    if (phone) {
      const phoneId = readIdentifier(phone);
      if (phoneId.kind !== 'phone') {
        return res.status(400).json({ status: 'error', message: phoneId.reason });
      }
      const phoneTaken = await User.findOne({ phone: { $in: phoneId.variants } });
      if (phoneTaken) {
        return res.status(409).json({
          status: 'error',
          code: 'PHONE_ALREADY_EXISTS',
          message: `${phoneId.value} is already registered to ${phoneTaken.name || 'another account'}. Use a different mobile number.`,
        });
      }
    }

    /**
     * The account is created without a password the admin could know.
     *
     * An admin used to mint one here and hand it over, which means the
     * vendor's password has been read by someone else and carried over
     * whatever channel was to hand. The vendor is emailed a one-time link
     * instead and chooses their own; `mustSetPassword` blocks sign-in until
     * they do, so this placeholder is not a way in even if it were guessed.
     */
    const placeholder = crypto.randomBytes(24).toString('hex');
    const hashedPassword = await bcrypt.hash(placeholder, 12);

    // -------------------------
    // Create Vendor User (ONLY ONCE)
    // -------------------------
    const vendorUser = await User.create({
      name: username || name,
      email,
      phone,
      password: hashedPassword,
      role: 'vendor',
      isVendorAutoCreated: true,
      mustSetPassword: true,
      walletBalance: 0,
    });

    // -------------------------
    // Parse Optional JSON Fields
    // -------------------------
    const parsedAddress =
      address && typeof address === 'string'
        ? JSON.parse(address)
        : address;

    const parsedBankDetails =
      bankDetails && typeof bankDetails === 'string'
        ? JSON.parse(bankDetails)
        : bankDetails;

    // -------------------------
    // Create Restaurant
    // -------------------------
    const restaurantData = {
      name,
      owner: vendorUser._id,
      phone,
      status,
      commissionPercent,
      isEnabled: status === 'approved',
      kycStatus: 'pending',
      address: parsedAddress,
      categories: businessType ? [businessType] : [],
      foodLicenseNumber,
      foodType,
      approxDeliveryTime,
      storeCharge,
      vendorOtpEnabled: vendorOtpEnabled === 'true',
      bankDetails: parsedBankDetails,
    };

    // Handle file uploads
    if (req.files) {
      const { getFilePath } = await import('../../middleware/uploadMiddleware.js');

      if (req.files.image?.[0]) {
        restaurantData.image = getFilePath('restaurants', req.files.image[0].filename);
      }
      if (req.files.foodLicenseDocument?.[0]) {
        restaurantData.foodLicenseDocument = getFilePath('restaurants', req.files.foodLicenseDocument[0].filename);
      }
      if (req.files.gstDocument?.[0]) {
        restaurantData.gstDocument = getFilePath('restaurants', req.files.gstDocument[0].filename);
      }
      if (req.files.cancelChequeDocument?.[0]) {
        restaurantData.cancelChequeDocument = getFilePath('restaurants', req.files.cancelChequeDocument[0].filename);
      }
    }

    const restaurant = await Restaurant.create(restaurantData);
    await restaurant.populate('owner', 'name email phone');

    /**
     * Invite the vendor to choose their own password.
     *
     * Deliberately awaited, unlike the welcome email it replaces: the whole
     * point of the account is that the vendor can get into it, so whether the
     * link went out is part of the result and not a detail to swallow. A
     * failure here does not undo the restaurant — the admin is told, and can
     * resend from the vendor's page.
     */
    let invite = { sent: false };
    try {
      invite = await sendSetupInvite({ user: vendorUser, businessName: name });
    } catch (inviteError) {
      console.error('[createVendor] invite failed:', inviteError?.message || inviteError);
    }

    /*
     * Confirm both contact details before the restaurant can trade.
     *
     * The set-password link proves the email address, but nothing has proved
     * the phone number - and that number is what riders and customers are
     * given to reach the kitchen. Staff typed both on the vendor's behalf, so
     * both are checked: the restaurant stays disabled until the codes come
     * back, whatever status the admin chose.
     */
    vendorUser.accountVerified = false;
    const contactCodes = await issueContactVerification(vendorUser, { role: 'vendor' });

    if (restaurant.isEnabled) {
      restaurant.isEnabled = false;
      await restaurant.save();
    }

    // -------------------------
    // Success Response
    // -------------------------
    return res.status(201).json({
      status: 'success',
      message: invite.sent
        ? `Vendor created. A set-password link has been emailed to ${email}.`
        : `Vendor created, but the set-password link could not be emailed to ${email}. Resend it from the vendor's page.`,
      data: {
        restaurant,
        invite: {
          email,
          sent: invite.sent,
          expiresAt: invite.expiresAt,
          // Only when no provider is configured, and never in production.
          ...(invite.devSetupLink ? { devSetupLink: invite.devSetupLink } : {}),
        },
      },
    });

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        status: 'error',
        message: 'Duplicate field detected.',
        key: error.keyPattern,
      });
    }

    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create vendor',
    });
  }
};

export const deleteRestaurant = async (req, res) => {
  try {
    const { id } = req.params;
    
    const restaurant = await Restaurant.findById(id);
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found',
      });
    }

    // Get owner user
    const owner = await User.findById(restaurant.owner);

    // Delete restaurant
    await Restaurant.findByIdAndDelete(id);

    // Delete vendor user if exists
    if (owner && owner.role === 'vendor') {
      await User.findByIdAndDelete(owner._id);
    }

    return res.status(200).json({
      success: true,
      message: 'Vendor and restaurant permanently deleted',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete vendor',
    });
  }
};

/**
 * POST /admin/restaurants/vendors/:id/verify-contact
 *
 * Confirms the codes sent when staff created the vendor. The restaurant is
 * enabled only once both the email address and the phone number have been
 * proved - the number is what riders and customers use to reach the kitchen,
 * so a mistyped one is not something to discover during a delivery.
 */
export const verifyVendorContact = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
    }

    const owner = await User.findById(restaurant.owner).select(
      '+contactVerification.emailOtp +contactVerification.phoneOtp'
    );
    if (!owner) {
      return res.status(404).json({ status: 'error', message: 'Vendor account not found' });
    }

    const result = await confirmContactVerification(owner, req.body || {});
    if (!result.ok) {
      return res.status(400).json({ status: 'error', message: result.message });
    }

    if (result.complete && restaurant.kycStatus === 'approved') {
      restaurant.isEnabled = true;
      await restaurant.save();
    }

    return res.json({
      status: 'success',
      message: result.message,
      data: {
        complete: result.complete,
        emailVerified: result.emailVerified,
        phoneVerified: result.phoneVerified,
        restaurantEnabled: restaurant.isEnabled,
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

/** POST /admin/restaurants/vendors/:id/resend-verification */
export const resendVendorContactVerification = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
    }
    const owner = await User.findById(restaurant.owner);
    if (!owner) {
      return res.status(404).json({ status: 'error', message: 'Vendor account not found' });
    }
    const delivery = await issueContactVerification(owner, { role: 'vendor' });
    return res.json({
      status: 'success',
      message: 'New codes sent.',
      data: { emailSent: delivery.email, smsSent: delivery.sms, problems: delivery.errors },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};


/** GET /admin/restaurants/:id/orders - vendor order history for the admin console. */
export const getRestaurantOrders = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid restaurant ID' });
    }
    const restaurant = await Restaurant.findById(id).select('_id name owner');
    if (!restaurant) return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
    const Order = mongoose.model('Order');
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    const filter = { restaurantId: restaurant._id, status: { $ne: 'Payment Pending' } };
    const [orders, total] = await Promise.all([
      Order.find(filter).populate('userId', 'name email phone').populate('items.foodItemId', 'name image price').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Order.countDocuments(filter),
    ]);
    return res.json({ status: 'success', data: { restaurant: { id: restaurant._id, name: restaurant.name }, orders, total, page, limit, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message || 'Failed to fetch vendor order history' });
  }
};
