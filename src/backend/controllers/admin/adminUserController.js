/**
 * Admin user controller. Manage customers (users) for dashboard.
 * Does NOT modify existing auth or user logic.
 */
import User from '../../models/User.js';
import Order from '../../models/Order.js';
import Membership from '../../models/Membership.js';
import Wallet from '../../models/Wallet.js';
import WalletTransaction from '../../models/WalletTransaction.js';
import Review from '../../models/Review.js';
import mongoose from 'mongoose';

/**
 * GET /admin/users - List all customers (role = 'user')
 * Query: page, limit, search, status (active/blocked)
 */
export const getUsers = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status; // active, blocked
    const city = (req.query.city || '').trim();
    const state = (req.query.state || '').trim();

    const filter = { role: 'user' };

    /**
     * A customer has no city of their own - they have addresses, and a person
     * who orders to two cities belongs to both. Matching inside the address
     * list is what makes "customers in Tirupati" mean what an owner expects.
     *
     * Anchored and case-insensitive rather than a loose regex: "Tirupati"
     * should not also return "Tirupati Rural" when the filter offered the two
     * as separate choices.
     */
    const exactly = (value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    if (city) filter['savedAddresses.city'] = exactly(city);
    if (state) filter['savedAddresses.state'] = exactly(state);
    
    // Search by name, email, phone
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by status
    if (status === 'active') {
      filter.isBlocked = false;
    } else if (status === 'blocked') {
      filter.isBlocked = true;
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires -__v')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      results: users.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        users,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch users',
    });
  }
};

/**
 * GET /admin/users/:id - Get single user detail
 */
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user ID',
      });
    }

    const user = await User.findOne({ 
      _id: id, 
      role: 'user' 
    })
    .select('-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires -__v')
    .lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    /*
     * Everything the customer page shows about a customer, worked out here.
     *
     * The page used to invent most of it: a fixed 4.7 average rating, a "Gold"
     * loyalty tier, savings guessed as 14% of spend, and a wallet that had
     * always added 1000 and spent 750 no matter whose page it was. Two card
     * numbers were hard-coded too. None of it described the customer being
     * looked at, so an admin could not act on any of it.
     */
    const userObjectId = new mongoose.Types.ObjectId(id);

    const [orderStats, walletDoc, walletActivity, membershipDoc, ratingStats, methodRows] =
      await Promise.all([
      Order.aggregate([
        { $match: { userId: userObjectId, status: { $ne: 'Payment Pending' } } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            /*
             * Spent means paid for. A cancelled order still counts as an
             * order they placed, but the money came back, and counting it
             * here made this page disagree with Customer Analytics about
             * the same customer.
             */
            totalSpent: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['Cancelled', 'RiderRejected']] },
                  0,
                  { $ifNull: ['$total', 0] },
                ],
              },
            },
            totalSavings: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['Cancelled', 'RiderRejected']] },
                  0,
                  { $ifNull: ['$discount', 0] },
                ],
              },
            },
            lastOrderAt: { $max: '$createdAt' },
          },
        },
      ]),
      Wallet.findOne({ userId: userObjectId }).lean(),
      WalletTransaction.find({ userId: userObjectId })
        .sort({ createdAt: -1 })
        .limit(25)
        .lean(),
      Membership.findOne({ userId: userObjectId, status: 'active' })
        .sort({ createdAt: -1 })
        .lean(),
      Review.aggregate([
        { $match: { userId: userObjectId } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
      /*
       * The payment methods this customer has actually used. Razorpay holds
       * the card details, not this platform, so there is no vault to read a
       * saved card from - what can honestly be shown is what they have paid
       * with before, newest first.
       */
      Order.aggregate([
        {
          $match: {
            userId: userObjectId,
            paymentStatus: 'paid',
            paymentMethod: { $nin: [null, ''] },
          },
        },
        {
          $group: {
            _id: '$paymentMethod',
            lastUsedAt: { $max: '$createdAt' },
            timesUsed: { $sum: 1 },
          },
        },
        { $sort: { lastUsedAt: -1 } },
      ]),
    ]);

    const totals = orderStats[0] || {};
    const rating = ratingStats[0] || {};

    res.status(200).json({
      status: 'success',
      data: {
        user,
        stats: {
          totalOrders: totals.totalOrders || 0,
          totalSpent: Number((totals.totalSpent || 0).toFixed(2)),
          totalSavings: Number((totals.totalSavings || 0).toFixed(2)),
          lastOrderAt: totals.lastOrderAt || null,
          // Null rather than a number when they have never rated anything:
          // the page shows a dash, which is true, instead of inventing 4.7.
          averageRating: rating.count ? Number(rating.avg.toFixed(2)) : null,
          ratingCount: rating.count || 0,
        },
        wallet: {
          balance: Number(walletDoc?.balance ?? user.walletBalance ?? 0),
          totalAdded: Number(walletDoc?.totalAdded ?? 0),
          totalSpent: Number(walletDoc?.totalSpent ?? 0),
          isFrozen: Boolean(walletDoc?.isFrozen),
          lastTransactionAt: walletDoc?.lastTransactionAt ?? null,
          /** Money an admin has withheld; still theirs, but not spendable. */
          heldAmount: Number(walletDoc?.heldAmount ?? 0),
          spendable: Math.max(
            0,
            Number(walletDoc?.balance ?? user.walletBalance ?? 0) -
              Number(walletDoc?.heldAmount ?? 0)
          ),
        },
        /*
         * What has been done to this wallet and by whom. The console had no
         * record of it at all, so a balance that moved was unexplainable.
         */
        walletActivity: walletActivity.map((entry) => ({
          id: entry._id,
          action: entry.metadata?.action ?? (entry.type === 'credit' ? 'add' : 'remove'),
          type: entry.type,
          amount: entry.amount,
          comment: entry.metadata?.comment ?? entry.description ?? '',
          balanceBefore: entry.balanceBefore,
          balanceAfter: entry.balanceAfter,
          by: entry.metadata?.adjustedByName ?? null,
          at: entry.createdAt,
        })),
        /*
         * Plus waives the delivery fee, so the console needs to see who holds
         * it - and, since an admin can grant it, until when.
         */
        membership: membershipDoc
          ? {
              active: new Date(membershipDoc.validTill) > new Date(),
              plan: membershipDoc.plan,
              planLabel: membershipDoc.planLabel,
              validTill: membershipDoc.validTill,
              grantedByAdmin: Number(membershipDoc.price) === 0,
            }
          : null,
        paymentMethods: methodRows.map((row) => ({
          method: row._id,
          timesUsed: row.timesUsed,
          lastUsedAt: row.lastUsedAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch user',
    });
  }
};

/**
 * PATCH /admin/users/:id - Correct a customer's details.
 *
 * The console could show a customer but never change one: "Edit Customer" was
 * a button with nothing behind it. This is what an admin is allowed to fix -
 * the name, the phone number and the email address - and nothing else. The
 * wallet balance is not editable here on purpose: money moves through the
 * wallet's own ledger so there is a record of who credited what, and an admin
 * typing a new balance over the old one would leave none.
 */
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid user ID' });
    }

    const { name, email, phone } = req.body || {};
    const updates = {};

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ status: 'error', message: 'Name cannot be empty' });
      }
      updates.name = String(name).trim();
    }

    if (email !== undefined) {
      const next = String(email).trim().toLowerCase();
      if (next && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
        return res.status(400).json({ status: 'error', message: 'That email address is not valid' });
      }
      updates.email = next;
    }

    if (phone !== undefined) {
      updates.phone = String(phone).trim();
    }

    // Whether this customer may pay cash on delivery. Off unless an admin
    // turns it on: cash is the one method where the platform is owed money
    // after the food has already gone.
    if (req.body.codEnabled !== undefined) {
      updates.codEnabled = Boolean(req.body.codEnabled);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ status: 'error', message: 'Nothing to update' });
    }

    /*
     * Email and phone identify an account at sign-in, so two customers cannot
     * share one. Checked here to answer with which field clashed; the unique
     * indexes are what actually enforce it.
     */
    for (const field of ['email', 'phone']) {
      if (!updates[field]) continue;
      const clash = await User.findOne({ [field]: updates[field], _id: { $ne: id } }).lean();
      if (clash) {
        return res.status(409).json({
          status: 'error',
          message: `Another account already uses that ${field === 'email' ? 'email address' : 'phone number'}.`,
        });
      }
    }

    const user = await User.findOneAndUpdate(
      { _id: id, role: 'user' },
      updates,
      { new: true, runValidators: true }
    )
      .select('-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires -__v')
      .lean();

    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    return res.status(200).json({ status: 'success', data: { user } });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        status: 'error',
        message: 'Another account already uses those details.',
      });
    }
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update user',
    });
  }
};

/**
 * PATCH /admin/users/:id/membership - grant or withdraw Reditoe Plus.
 *
 * Plus waives the delivery fee, so who holds it is a commercial decision the
 * client wanted to be able to make directly rather than only through a
 * customer paying for it. Granting here records a membership with a price of
 * zero and no auto-renewal: it is a gift, and it should lapse rather than
 * quietly start charging somebody.
 *
 * Withdrawing marks the membership cancelled rather than deleting it, so the
 * fact it was once given does not disappear from the record.
 */
export const updateUserMembership = async (req, res) => {
  try {
    const { id } = req.params;
    const { active, months } = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid user ID' });
    }

    const user = await User.findOne({ _id: id, role: 'user' }).lean();
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

    if (active === false) {
      await Membership.updateMany(
        { userId: id, status: 'active' },
        { $set: { status: 'cancelled', autoRenewal: false } }
      );
      return res.json({
        status: 'success',
        message: 'Reditoe Plus withdrawn',
        data: { membership: null },
      });
    }

    // Whole months, at least one, and not so far out that a mistyped number
    // grants a decade of free delivery.
    const span = Math.min(24, Math.max(1, Math.floor(Number(months) || 1)));
    const validTill = new Date();
    validTill.setMonth(validTill.getMonth() + span);

    // One active membership at a time: a second would leave two expiry dates
    // and no way to say which one counts.
    await Membership.updateMany(
      { userId: id, status: 'active' },
      { $set: { status: 'cancelled', autoRenewal: false } }
    );

    const membership = await Membership.create({
      userId: id,
      plan: span >= 12 ? 'yearly' : span >= 3 ? 'quarterly' : 'monthly',
      planLabel: `Granted by admin · ${span} month${span === 1 ? '' : 's'}`,
      status: 'active',
      startedAt: new Date(),
      validTill,
      autoRenewal: false,
      price: 0,
    });

    return res.json({
      status: 'success',
      message: 'Reditoe Plus granted',
      data: { membership },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update the membership',
    });
  }
};

/**
 * PATCH /admin/users/:id/status - Block/Unblock user
 */
export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isBlocked } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user ID',
      });
    }

    if (typeof isBlocked !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'isBlocked must be a boolean',
      });
    }

    const user = await User.findOneAndUpdate(
      { _id: id, role: 'user' },
      { isBlocked },
      { new: true, runValidators: true }
    )
    .select('-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires -__v')
    .lean();

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: `User ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
      data: {
        user,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update user status',
    });
  }
};

/**
 * GET /admin/users/:id/orders - Get user's order history
 * Query: page, limit
 */
export const getUserOrders = async (req, res) => {
  try {
    const { id } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user ID',
      });
    }

    // Check if user exists
    const user = await User.findOne({ _id: id, role: 'user' }).select('_id').lean();
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    const [orders, total] = await Promise.all([
      Order.find({ userId: id })
        .populate('restaurantId', 'name email phone')
        .populate('items.foodItemId', 'name price')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments({ userId: id }),
    ]);

    res.status(200).json({
      status: 'success',
      results: orders.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        orders,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch user orders',
    });
  }
};

/**
 * POST /admin/users/:id/refund - Admin manual refund marking
 * Body: { orderId, reason, notes }
 */
export const markRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderId, reason, notes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid user ID',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid order ID',
      });
    }

    if (!reason || typeof reason !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Reason is required and must be a string',
      });
    }

    // Check if user exists
    const user = await User.findOne({ _id: id, role: 'user' }).select('_id').lean();
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    // Check if order exists and belongs to this user
    const order = await Order.findOne({ _id: orderId, userId: id }).lean();
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found or does not belong to this user',
      });
    }

    // Add refund entry to timeline
    const refundEntry = {
      status: 'Refund Marked',
      timestamp: new Date(),
      message: `Refund marked by admin. Reason: ${reason}${notes ? `. Notes: ${notes}` : ''}`,
    };

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      { 
        $push: { timeline: refundEntry },
        paymentStatus: 'refunded'
      },
      { new: true, runValidators: true }
    )
    .populate('restaurantId', 'name')
    .populate('items.foodItemId', 'name')
    .lean();

    res.status(200).json({
      status: 'success',
      message: 'Refund marked successfully',
      data: {
        order: updatedOrder,
        refundInfo: {
          orderId,
          reason,
          notes: notes || '',
          markedAt: new Date(),
          markedBy: req.admin?.email || 'admin',
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to mark refund',
    });
  }
};
