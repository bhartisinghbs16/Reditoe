import VendorWithdrawal from '../models/VendorWithdrawal.js';
import VendorSettlement from '../models/VendorSettlement.js';
import Restaurant from '../models/Restaurant.js';
import User from '../models/User.js';
import mongoose from 'mongoose';
import {
  createRazorpayContact,
  createFundAccount,
  processRazorpayPayout
} from '../services/razorpayPayoutService.js';

const MIN_WITHDRAWAL = Number(process.env.VENDOR_MIN_WITHDRAWAL || 100);

const getVendorAndRestaurant = async (vendorId) => {
  const restaurant = await Restaurant.findOne({ owner: vendorId });
  if (!restaurant) {
    throw new Error('Restaurant not found for vendor');
  }
  const vendor = await User.findById(vendorId);
  if (!vendor) {
    throw new Error('Vendor not found');
  }
  return { vendor, restaurant };
};

export const getVendorWithdrawalSummary = async (req, res) => {
  try {
    const vendorId = req.user.id;
    console.log('WITHDRAWAL SUMMARY DEBUG:', {
      vendorId,
      userId: req.user?.id,
      userId2: req.user?._id,
    });

    // Get total processed withdrawals
    const processed = await VendorWithdrawal.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: { $in: ['processed'] }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    // Get pending withdrawals
    const pending = await VendorWithdrawal.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: { $in: ['pending', 'approved'] }
        }
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const alreadyWithdrawn = processed[0]?.total || 0;
    const pendingWithdrawals = pending[0]?.total || 0;

    // Get confirmed earnings from APPROVED (not yet paid) settlements
    const approvedSettlements = await VendorSettlement.aggregate([
      {
        $match: {
          vendorId: new mongoose.Types.ObjectId(vendorId),
          status: 'approved'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$summary.finalAmount' }
        }
      }
    ]);

    const confirmedEarnings = approvedSettlements[0]?.total || 0;
    console.log('APPROVED SETTLEMENTS:', approvedSettlements);
    console.log('CONFIRMED EARNINGS:', confirmedEarnings);

    // withdrawable = confirmedEarnings minus already withdrawn minus pending withdrawals
    // This accurately subtracts on-demand VendorWithdrawal requests from the approved VendorSettlement pool
    const withdrawable = Math.max(
      0,
      confirmedEarnings - alreadyWithdrawn - pendingWithdrawals
    );

    // Calculate Unsettled Earnings
    // 1. Get all order IDs that have already been included in any settlement
    const allSettlements = await VendorSettlement.find({ vendorId }).select('items.orderId');
    const settledOrderIds = allSettlements.flatMap(s => s.items.map(item => item.orderId));

    // 2. Find Delivered orders not yet in any settlement
    const { default: Order } = await import('../models/Order.js');
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    
    let unsettledEarnings = 0;
    if (restaurant) {
      const unsettledOrders = await Order.find({
        restaurantId: restaurant._id,
        status: 'Delivered',
        _id: { $nin: settledOrderIds }
      });

      const commissionPercent = restaurant.commissionPercent || 10;
      const gstPercent = restaurant.gstInfo?.gstPercentage || 5;
      const platformFeePercent = 2;

      unsettledOrders.forEach(order => {
        const gross = order.subtotal || 0;           // vendor's food revenue only (NOT order.total)
        const comm = Math.round(gross * (commissionPercent / 100));
        const gst = Math.round(gross * (gstPercent / 100));
        // platformFee is never the vendor's — it was collected from customer and stays with platform
        unsettledEarnings += (gross - comm - gst);
      });
    }

    console.log('WITHDRAWAL SUMMARY RESPONSE:', JSON.stringify({
      withdrawable,
      confirmedEarnings,
      alreadyWithdrawn,
      pendingWithdrawals,
      unsettledEarnings,
    }));

    return res.status(200).json({
      status: 'success',
      data: {
        withdrawable,
        confirmedEarnings,
        alreadyWithdrawn,
        pendingWithdrawals,
        unsettledEarnings,
      },
    });
  } catch (error) {
    return res.status(400).json({ status: 'error', message: error.message || 'Failed to fetch summary' });
  }
};

export const createVendorWithdrawalRequest = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const amount = Number(req.body?.amount || 0);

    if (!amount || amount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Withdrawal amount must be greater than 0',
      });
    }
    if (amount < MIN_WITHDRAWAL) {
      return res.status(400).json({
        status: 'error',
        message: `Minimum withdrawal amount is ₹${MIN_WITHDRAWAL}`,
      });
    }

    // Get vendor user
    const vendor = await User.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        status: 'error',
        message: 'Vendor not found',
      });
    }

    // Get restaurant
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    // Check bank details
    const bank = vendor.bankDetails || {};
    if (!bank.accountNumber || !bank.ifsc ||
        !bank.bankName || !bank.accountHolderName) {
      return res.status(400).json({
        status: 'error',
        message: 'Please update your bank details in profile first',
      });
    }

    // Check no existing pending withdrawal
    const pendingExisting = await VendorWithdrawal.findOne({
      vendorId,
      status: { $in: ['pending', 'approved'] },
    });
    if (pendingExisting) {
      return res.status(400).json({
        status: 'error',
        message: 'You already have a pending withdrawal request',
      });
    }

    // Create withdrawal record
    const withdrawalId = `WD-${Date.now()}-${Math.random()
      .toString(36).substr(2, 6).toUpperCase()}`;

    const withdrawal = await VendorWithdrawal.create({
      withdrawalId,
      vendorId,
      restaurantId: restaurant._id,
      amount,
      bankDetailsSnapshot: {
        accountHolderName: bank.accountHolderName || vendor.name,
        accountNumber: bank.accountNumber,
        ifsc: bank.ifsc,
        bankName: bank.bankName,
        branch: bank.branch || '',
      },
      status: 'pending',
    });

    // Process Razorpay Payout immediately
    try {
      const contact = await createRazorpayContact(vendor);
      const fundAccount = await createFundAccount(
        contact.id, bank
      );
      const payout = await processRazorpayPayout({
        fundAccountId: fundAccount.id,
        amount,
        vendorId: vendorId.toString(),
        withdrawalId: withdrawal._id.toString(),
      });

      // Update withdrawal status based on Razorpay payout state
      withdrawal.status =
        payout.status === 'processed' ? 'processed' : 'approved';
      withdrawal.transactionReference = payout.id;
      withdrawal.processedAt = new Date();
      await withdrawal.save();

      return res.status(201).json({
        status: 'success',
        message: 'Withdrawal processed successfully via Razorpay',
        data: {
          withdrawal,
          payoutId: payout.id,
          payoutStatus: payout.status,
        },
      });
    } catch (payoutError) {
      // Payout failed - keep withdrawal as pending for manual processing
      console.error('Razorpay payout failed:', payoutError.message);
      withdrawal.adminNotes = `Payout failed: ${payoutError.message}`;
      await withdrawal.save();

      return res.status(201).json({
        status: 'success',
        message: 'Withdrawal request submitted. Will be processed within 24 hours.',
        data: { withdrawal },
      });
    }
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message || 'Failed to create withdrawal request' });
  }
};

export const getVendorWithdrawals = async (req, res) => {
  try {
    const vendorId = req.user.id;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const [withdrawals, total] = await Promise.all([
      VendorWithdrawal.find({ vendorId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      VendorWithdrawal.countDocuments({ vendorId }),
    ]);
    return res.status(200).json({
      status: 'success',
      data: { withdrawals, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message || 'Failed to fetch withdrawals' });
  }
};

export const processVendorPayout = async (req, res) => {
  try {
    const vendorId = req.user?.id || req.user?._id;
    const { withdrawalId } = req.body;

    if (!withdrawalId) {
      return res.status(400).json({
        success: false,
        message: 'Withdrawal ID is required',
      });
    }

    // Find withdrawal
    const withdrawal = await VendorWithdrawal.findOne({
      _id: withdrawalId,
      vendorId,
      status: 'approved',
    });

    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        message: 'Approved withdrawal not found',
      });
    }

    // Get vendor user
    const vendor = await User.findById(vendorId);
    if (!vendor) {
      return res.status(404).json({
        success: false,
        message: 'Vendor not found',
      });
    }

    // Check bank details
    const bank = vendor.bankDetails;
    if (!bank?.accountNumber || !bank?.ifsc || !bank?.bankName) {
      return res.status(400).json({
        success: false,
        message: 'Bank details incomplete. Please update your profile.',
      });
    }

    // Create Razorpay contact
    const contact = await createRazorpayContact(vendor);

    // Create fund account
    const fundAccount = await createFundAccount(
      contact.id,
      bank
    );

    // Process payout
    const payout = await processRazorpayPayout({
      fundAccountId: fundAccount.id,
      amount: withdrawal.amount,
      vendorId: vendorId.toString(),
      withdrawalId: withdrawal._id.toString(),
    });

    // Update withdrawal status
    withdrawal.status =
      payout.status === 'processed' ? 'processed' : 'approved';
    withdrawal.transactionReference = payout.id;
    withdrawal.processedAt = new Date();
    await withdrawal.save();

    return res.status(200).json({
      success: true,
      message: 'Payout processed successfully',
      data: {
        payoutId: payout.id,
        status: payout.status,
        amount: withdrawal.amount,
        transactionReference: payout.id,
      },
    });
  } catch (error) {
    console.error('Razorpay payout error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Payout processing failed',
    });
  }
};

