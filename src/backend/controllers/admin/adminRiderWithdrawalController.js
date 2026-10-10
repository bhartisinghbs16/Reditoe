/**
 * Admin Rider Withdrawal Controller
 * Handles admin approval/rejection of rider withdrawal requests
 */
import RiderWithdrawal from '../../models/RiderWithdrawal.js';
import RiderWallet from '../../models/RiderWallet.js';
import User from '../../models/User.js';
import mongoose from 'mongoose';

/**
 * Get all withdrawal requests - GET /api/admin/rider-withdrawals
 */
export const getWithdrawalRequests = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status; // optional: pending, approved, rejected, processed
    const payoutMode = req.query.payoutMode; // optional: autopay | manual
    const autopayStatus = req.query.autopayStatus; // optional autopay status filter

    const filter = {};
    if (status && ['pending', 'approved', 'rejected', 'processed'].includes(status)) {
      filter.status = status;
    }
    if (payoutMode === 'autopay') filter.isAutopay = true;
    if (payoutMode === 'manual') filter.isAutopay = { $ne: true };
    if (autopayStatus && ['queued', 'approved', 'processed', 'failed', 'manual_fallback'].includes(autopayStatus)) {
      filter.autopayStatus = autopayStatus;
    }

    const [withdrawals, total] = await Promise.all([
      RiderWithdrawal.find(filter)
        .populate('riderId', 'name email phone riderId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      RiderWithdrawal.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      results: withdrawals.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        withdrawals: withdrawals.map(withdrawal => ({
          id: withdrawal._id,
          rider: withdrawal.riderId,
          amount: withdrawal.amount,
          status: withdrawal.status,
          isAutopay: !!withdrawal.isAutopay,
          autopayStatus: withdrawal.autopayStatus || null,
          autopayReference: withdrawal.autopayReference || null,
          autopayFailureReason: withdrawal.autopayFailureReason || null,
          bankDetails: withdrawal.bankDetails,
          createdAt: withdrawal.createdAt,
          processedAt: withdrawal.processedAt,
          processedBy: withdrawal.processedBy,
          rejectionReason: withdrawal.rejectionReason,
          transactionReference: withdrawal.transactionReference,
          adminNotes: withdrawal.adminNotes,
        })),
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch withdrawal requests',
    });
  }
};

/**
 * Get withdrawal request by ID - GET /api/admin/rider-withdrawals/:id
 */
export const getWithdrawalById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid withdrawal ID',
      });
    }

    const withdrawal = await RiderWithdrawal.findById(id)
      .populate('riderId', 'name email phone riderId')
      .populate('processedBy', 'name email');

    if (!withdrawal) {
      return res.status(404).json({
        status: 'error',
        message: 'Withdrawal request not found',
      });
    }

    // Get rider wallet information
    const wallet = await RiderWallet.findOne({ riderId: withdrawal.riderId._id });

    res.status(200).json({
      status: 'success',
      data: {
        withdrawal: {
          id: withdrawal._id,
          rider: withdrawal.riderId,
          amount: withdrawal.amount,
          status: withdrawal.status,
          bankDetails: withdrawal.bankDetails,
          createdAt: withdrawal.createdAt,
          processedAt: withdrawal.processedAt,
          processedBy: withdrawal.processedBy,
          rejectionReason: withdrawal.rejectionReason,
          transactionReference: withdrawal.transactionReference,
          adminNotes: withdrawal.adminNotes,
        },
        riderWallet: wallet ? {
          balance: wallet.balance,
          totalEarnings: wallet.totalEarnings,
          totalWithdrawn: wallet.totalWithdrawn,
        } : null,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch withdrawal request',
    });
  }
};

/**
 * Approve withdrawal request - PATCH /api/admin/rider-withdrawals/:id/approve
 */
export const approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionReference, adminNotes } = req.body;
    const adminId = req.user?.id || req.user?._id;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid withdrawal ID',
      });
    }

    const withdrawal = await RiderWithdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({
        status: 'error',
        message: 'Withdrawal request not found',
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot approve withdrawal with status: ${withdrawal.status}`,
      });
    }

    // Update withdrawal status
    withdrawal.status = 'approved';
    withdrawal.processedBy = adminId;
    withdrawal.processedAt = new Date();
    withdrawal.transactionReference = transactionReference?.trim() || '';
    withdrawal.adminNotes = adminNotes?.trim() || '';

    await withdrawal.save();

    // Populate rider information for response
    await withdrawal.populate('riderId', 'name email phone riderId');
    await withdrawal.populate('processedBy', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Withdrawal request approved successfully',
      data: {
        withdrawal: {
          id: withdrawal._id,
          rider: withdrawal.riderId,
          amount: withdrawal.amount,
          status: withdrawal.status,
          transactionReference: withdrawal.transactionReference,
          processedAt: withdrawal.processedAt,
          processedBy: withdrawal.processedBy,
        },
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to approve withdrawal request',
    });
  }
};

/**
 * Reject withdrawal request - PATCH /api/admin/rider-withdrawals/:id/reject
 */
export const rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason, adminNotes } = req.body;
    const adminId = req.user?.id || req.user?._id;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid withdrawal ID',
      });
    }

    if (!rejectionReason || !rejectionReason.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Rejection reason is required',
      });
    }

    const withdrawal = await RiderWithdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({
        status: 'error',
        message: 'Withdrawal request not found',
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot reject withdrawal with status: ${withdrawal.status}`,
      });
    }

    // Update withdrawal status
    withdrawal.status = 'rejected';
    withdrawal.processedBy = adminId;
    withdrawal.processedAt = new Date();
    withdrawal.rejectionReason = rejectionReason.trim();
    withdrawal.adminNotes = adminNotes?.trim() || '';

    await withdrawal.save();

    // Refund amount back to rider wallet
    const wallet = await RiderWallet.findOne({ riderId: withdrawal.riderId });
    if (wallet) {
      wallet.balance += withdrawal.amount;
      await wallet.save();
    }

    // Populate rider information for response
    await withdrawal.populate('riderId', 'name email phone riderId');
    await withdrawal.populate('processedBy', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Withdrawal request rejected successfully',
      data: {
        withdrawal: {
          id: withdrawal._id,
          rider: withdrawal.riderId,
          amount: withdrawal.amount,
          status: withdrawal.status,
          rejectionReason: withdrawal.rejectionReason,
          processedAt: withdrawal.processedAt,
          processedBy: withdrawal.processedBy,
        },
        refundedAmount: withdrawal.amount,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to reject withdrawal request',
    });
  }
};

/**
 * Mark withdrawal as processed - PATCH /api/admin/rider-withdrawals/:id/process
 */
export const processWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionReference, adminNotes } = req.body;
    const adminId = req.user?.id || req.user?._id;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid withdrawal ID',
      });
    }

    if (!transactionReference || !transactionReference.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Transaction reference is required',
      });
    }

    const withdrawal = await RiderWithdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({
        status: 'error',
        message: 'Withdrawal request not found',
      });
    }

    if (withdrawal.status !== 'approved') {
      return res.status(400).json({
        status: 'error',
        message: `Cannot process withdrawal with status: ${withdrawal.status}`,
      });
    }

    // Update withdrawal status
    withdrawal.status = 'processed';
    withdrawal.processedBy = adminId;
    withdrawal.processedAt = new Date();
    withdrawal.transactionReference = transactionReference.trim();
    withdrawal.adminNotes = adminNotes?.trim() || '';

    await withdrawal.save();

    // Finalize accounted withdrawal total only when actually processed.
    const wallet = await RiderWallet.findOne({ riderId: withdrawal.riderId });
    if (wallet) {
      wallet.totalWithdrawn += withdrawal.amount;
      await wallet.save();
    }

    // Populate rider information for response
    await withdrawal.populate('riderId', 'name email phone riderId');
    await withdrawal.populate('processedBy', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Withdrawal marked as processed successfully',
      data: {
        withdrawal: {
          id: withdrawal._id,
          rider: withdrawal.riderId,
          amount: withdrawal.amount,
          status: withdrawal.status,
          transactionReference: withdrawal.transactionReference,
          processedAt: withdrawal.processedAt,
          processedBy: withdrawal.processedBy,
        },
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to process withdrawal request',
    });
  }
};

/**
 * Get withdrawal statistics - GET /api/admin/rider-withdrawals/stats
 */
export const getWithdrawalStats = async (req, res) => {
  try {
    const stats = await RiderWithdrawal.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
        },
      },
    ]);

    const statusMap = {};
    let totalRequests = 0;
    let totalAmount = 0;

    stats.forEach(stat => {
      statusMap[stat._id] = {
        count: stat.count,
        totalAmount: Math.round(stat.totalAmount * 100) / 100,
      };
      totalRequests += stat.count;
      totalAmount += stat.totalAmount;
    });

    // Get recent withdrawals
    const recentWithdrawals = await RiderWithdrawal.find()
      .populate('riderId', 'name email')
      .sort({ createdAt: -1 })
      .limit(10);

    res.status(200).json({
      status: 'success',
      data: {
        summary: {
          totalRequests,
          totalAmount: Math.round(totalAmount * 100) / 100,
          pending: statusMap.pending || { count: 0, totalAmount: 0 },
          approved: statusMap.approved || { count: 0, totalAmount: 0 },
          rejected: statusMap.rejected || { count: 0, totalAmount: 0 },
          processed: statusMap.processed || { count: 0, totalAmount: 0 },
        },
        recentWithdrawals: recentWithdrawals.map(withdrawal => ({
          id: withdrawal._id,
          rider: withdrawal.riderId,
          amount: withdrawal.amount,
          status: withdrawal.status,
          createdAt: withdrawal.createdAt,
        })),
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch withdrawal statistics',
    });
  }
};

export default {
  getWithdrawalRequests,
  getWithdrawalById,
  approveWithdrawal,
  rejectWithdrawal,
  processWithdrawal,
  getWithdrawalStats,
};
