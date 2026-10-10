import Refund from '../../models/Refund.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import mongoose from 'mongoose';
import Wallet from '../../models/Wallet.js';
import WalletTransaction from '../../models/WalletTransaction.js';
import { refundPayment } from '../../services/refundGatewayService.js';
import websocketService from '../../services/websocketService.js';

/**
 * GET /admin/refunds - List all refunds with filtering and pagination
 * Query: page, limit, status, userId, orderId, fromDate, toDate
 */
export const getRefunds = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    
    const {
      status,
      userId,
      orderId,
      fromDate,
      toDate,
      priority
    } = req.query;

    // Build filter
    const filter = {};
    if (status && ['pending', 'approved', 'rejected', 'processed', 'completed'].includes(status)) {
      filter.refundStatus = status;
    }
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      filter.userId = new mongoose.Types.ObjectId(userId);
    }
    if (orderId && mongoose.Types.ObjectId.isValid(orderId)) {
      filter.orderId = new mongoose.Types.ObjectId(orderId);
    }
    if (priority && ['low', 'medium', 'high', 'urgent'].includes(priority)) {
      filter.priority = priority;
    }
    if (fromDate || toDate) {
      const dateFilter = {};
      if (fromDate) {
        const from = new Date(fromDate);
        if (!isNaN(from.getTime())) dateFilter.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        if (!isNaN(to.getTime())) {
          // Same whole-day rule as the totals, so the list and the figures
          // above it cover the same window.
          if (!/[T ]/.test(String(toDate))) to.setUTCHours(23, 59, 59, 999);
          dateFilter.$lte = to;
        }
      }
      if (Object.keys(dateFilter).length > 0) filter.createdAt = dateFilter;
    }

    const [refunds, total] = await Promise.all([
      Refund.find(filter)
        .populate('userId', 'name email phone')
        .populate('orderId', 'total status createdAt paymentMethod items')
        .populate('adminActionLog.adminId', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Refund.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      results: refunds.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        refunds,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch refunds',
    });
  }
};

/**
 * GET /admin/refunds/:id - Get single refund by ID
 */
export const getRefundById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid refund ID',
      });
    }

    const refund = await Refund.findById(id)
      .populate('userId', 'name email phone')
      .populate('orderId', 'total status createdAt paymentMethod items deliveryAddress restaurantId')
      .populate('orderId.restaurantId', 'name phone')
      .populate('adminActionLog.adminId', 'name email')
      .populate('refundTimeline.updatedBy', 'name email')
      .populate('evidence.uploadedBy', 'name email');

    if (!refund) {
      return res.status(404).json({
        status: 'error',
        message: 'Refund not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        refund,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch refund',
    });
  }
};

/**
 * POST /admin/refunds/initiate - Initiate a new refund (admin only)
 * Body: { orderId, refundAmount, refundReason, refundMethod, notes, priority }
 */
export const initiateRefund = async (req, res) => {
  try {
    const {
      orderId,
      refundAmount,
      refundReason,
      refundMethod = 'original_payment',
      notes,
      priority = 'medium'
    } = req.body;

    // Validation
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid order ID is required',
      });
    }

    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Refund amount must be greater than 0',
      });
    }

    if (!refundReason || !refundReason.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Refund reason is required',
      });
    }

    // Check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    // Check if refund already exists for this order
    const existingRefund = await Refund.findOne({ orderId });
    if (existingRefund) {
      return res.status(400).json({
        status: 'error',
        message: 'A refund already exists for this order',
      });
    }

    // Validate refund amount against order total
    if (refundAmount > order.total) {
      return res.status(400).json({
        status: 'error',
        message: 'Refund amount cannot exceed order total',
      });
    }

    // Create new refund
    const refund = new Refund({
      orderId,
      userId: order.userId,
      refundAmount: parseFloat(refundAmount),
      refundReason: refundReason.trim(),
      refundMethod,
      priority,
      adminActionLog: [{
        adminId: req.user.id,
        action: 'created',
        notes: notes ? notes.trim() : '',
        timestamp: new Date(),
      }],
      refundTimeline: [{
        status: 'requested',
        timestamp: new Date(),
        message: `Refund requested: ₹${refundAmount} - ${refundReason.trim()}`,
        updatedBy: req.user.id,
      }],
    });

    await refund.save();

    // Update order refund info
    order.refundInfo = {
      isRefunded: true,
      refundAmount: parseFloat(refundAmount),
      refundReason: refundReason.trim(),
      refundNotes: notes ? notes.trim() : '',
      refundDate: new Date(),
      refundedBy: req.user.id,
    };

    if (!order.timeline) order.timeline = [];
    order.timeline.push({
      status: order.status,
      timestamp: new Date(),
      message: `Refund initiated: ₹${refundAmount} - ${refundReason.trim()}`,
    });

    await order.save();

    // Emit real-time updates
    websocketService.emitRefundUpdate(order, {
      refundAmount: parseFloat(refundAmount),
      refundReason: refundReason.trim(),
      refundStatus: 'pending',
      initiatedBy: req.user.id,
      initiatedAt: new Date()
    });

    // Populate and return
    await refund.populate('userId', 'name email phone');
    await refund.populate('orderId', 'total status createdAt');
    await refund.populate('adminActionLog.adminId', 'name email');

    res.status(201).json({
      status: 'success',
      message: 'Refund initiated successfully',
      data: {
        refund,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to initiate refund',
    });
  }
};

/**
 * PATCH /admin/refunds/:id/approve - Approve a refund
 * Body: { notes, processingDetails }
 */
export const approveRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, processingDetails } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid refund ID',
      });
    }

    const refund = await Refund.findById(id);
    if (!refund) {
      return res.status(404).json({
        status: 'error',
        message: 'Refund not found',
      });
    }

    if (refund.refundStatus !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: 'Only pending refunds can be approved',
      });
    }

    /*
     * Approving sends the money back. It used to only say so.
     *
     * This marked the order 'refunded' and stopped there - no call to the
     * gateway, nothing moved. The console then showed a refunded order, the
     * customer's statement showed nothing, and the only way to find out was
     * for them to complain. Approval and payment are one step now: if the
     * gateway refuses, the refund stays pending with the reason on it rather
     * than claiming to have paid.
     */
    const order = await Order.findById(refund.orderId);
    const settleTo =
      refund.refundMethod === 'wallet' ? 'wallet' : 'original_payment';

    let gatewayResult = { ok: true, gatewayRefundId: null };

    if (settleTo === 'original_payment') {
      gatewayResult = await refundPayment({
        paymentId: order?.razorpayPaymentId,
        amount: refund.refundAmount,
        notes: {
          orderNumber: order?.orderNumber || '',
          refundId: refund.refundId,
          approvedBy: req.user?.name || req.user?.email || 'admin',
        },
      });

      if (!gatewayResult.ok) {
        refund.refundTimeline.push({
          status: 'under_review',
          timestamp: new Date(),
          message: `Approval could not be paid out: ${gatewayResult.reason}`,
          updatedBy: req.user.id,
        });
        await refund.save();

        return res.status(502).json({
          status: 'error',
          code: 'gateway_refund_failed',
          message: `The refund was not paid out: ${gatewayResult.reason}`,
        });
      }
    } else {
      // Back into the wallet, through the ledger like any other movement, so
      // there is a record of where the money came from.
      const wallet =
        (await Wallet.findOne({ userId: refund.userId })) ||
        new Wallet({ userId: refund.userId, balance: 0 });
      const before = Number(wallet.balance || 0);
      const after = Math.round((before + Number(refund.refundAmount)) * 100) / 100;
      wallet.balance = after;
      wallet.lastTransactionAt = new Date();
      await wallet.save();

      await WalletTransaction.create({
        userId: refund.userId,
        type: 'credit',
        amount: refund.refundAmount,
        description: `Refund for order ${order?.orderNumber || ''}`.trim(),
        status: 'completed',
        category: 'refund',
        balanceBefore: before,
        balanceAfter: after,
        refundId: refund.refundId,
        metadata: { approvedBy: String(req.user?._id || 'admin'), source: 'refund' },
      });

      await User.updateOne({ _id: refund.userId }, { $set: { walletBalance: after } });
    }

    // Update refund status
    refund.refundStatus = 'approved';

    // Add admin action log
    refund.adminActionLog.push({
      adminId: req.user.id,
      action: 'approved',
      notes: notes ? notes.trim() : '',
      timestamp: new Date(),
    });

    // Add to timeline
    refund.refundTimeline.push({
      status: 'approved',
      timestamp: new Date(),
      message: `Refund approved by admin${notes ? `: ${notes.trim()}` : ''}`,
      updatedBy: req.user.id,
    });

    // What the gateway (or the wallet) actually did, kept against the refund.
    refund.processingDetails = {
      ...(processingDetails || {}),
      transactionId: gatewayResult.gatewayRefundId || `wallet:${refund.refundId}`,
      // Shown in place of the order id once the refund is approved, because
      // this is the reference the customer's bank will recognise.
      bankRRN: gatewayResult.bankRRN || '',
      processedAt: new Date(),
      processor: req.user.name || req.user.email || 'admin',
    };

    refund.refundTimeline.push({
      status: 'processed',
      timestamp: new Date(),
      message:
        settleTo === 'wallet'
          ? `₹${refund.refundAmount} returned to the customer's Reditoe Money`
          : `₹${refund.refundAmount} sent back through the gateway (${gatewayResult.gatewayRefundId})`,
      updatedBy: req.user.id,
    });

    await refund.save();

    // Update order status
    if (order) {
      order.paymentStatus = 'refunded';
      order.refundInfo = {
        ...order.refundInfo,
        isRefunded: true,
        refundProcessed: true,
        refundProcessedDate: new Date(),
      };

      if (!order.timeline) order.timeline = [];
      order.timeline.push({
        status: order.status,
        timestamp: new Date(),
        message: `Refund approved: ₹${refund.refundAmount}`,
      });

      await order.save();

      // Emit real-time update
      websocketService.emitRefundUpdate(order, {
        refundAmount: refund.refundAmount,
        refundStatus: 'approved',
        approvedBy: req.user.id,
        approvedAt: new Date()
      });
    }

    // Populate and return
    await refund.populate('userId', 'name email phone');
    await refund.populate('orderId', 'total status createdAt');
    await refund.populate('adminActionLog.adminId', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Refund approved successfully',
      data: {
        refund,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to approve refund',
    });
  }
};

/**
 * PATCH /admin/refunds/:id/reject - Reject a refund
 * Body: { reason, notes }
 */
export const rejectRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, notes } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid refund ID',
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Rejection reason is required',
      });
    }

    const refund = await Refund.findById(id);
    if (!refund) {
      return res.status(404).json({
        status: 'error',
        message: 'Refund not found',
      });
    }

    if (refund.refundStatus !== 'pending') {
      return res.status(400).json({
        status: 'error',
        message: 'Only pending refunds can be rejected',
      });
    }

    // Update refund status
    refund.refundStatus = 'rejected';
    
    // Add admin action log
    refund.adminActionLog.push({
      adminId: req.user.id,
      action: 'rejected',
      notes: `${reason.trim()}${notes ? ` - ${notes.trim()}` : ''}`,
      timestamp: new Date(),
    });

    // Add to timeline
    refund.refundTimeline.push({
      status: 'rejected',
      timestamp: new Date(),
      message: `Refund rejected: ${reason.trim()}`,
      updatedBy: req.user.id,
    });

    await refund.save();

    // Update order
    const order = await Order.findById(refund.orderId);
    if (order) {
      order.refundInfo = {
        ...order.refundInfo,
        isRefunded: false,
        refundRejected: true,
        refundRejectedDate: new Date(),
        refundRejectedReason: reason.trim(),
      };

      if (!order.timeline) order.timeline = [];
      order.timeline.push({
        status: order.status,
        timestamp: new Date(),
        message: `Refund rejected: ${reason.trim()}`,
      });

      await order.save();

      // Emit real-time update
      websocketService.emitRefundUpdate(order, {
        refundAmount: refund.refundAmount,
        refundStatus: 'rejected',
        rejectedBy: req.user.id,
        rejectedAt: new Date(),
        rejectionReason: reason.trim()
      });
    }

    // Populate and return
    await refund.populate('userId', 'name email phone');
    await refund.populate('orderId', 'total status createdAt');
    await refund.populate('adminActionLog.adminId', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Refund rejected successfully',
      data: {
        refund,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to reject refund',
    });
  }
};

/**
 * PATCH /admin/refunds/:id/process - Mark refund as processed (payment sent)
 * Body: { transactionId, processingNotes }
 */
export const processRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { transactionId, processingNotes } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid refund ID',
      });
    }

    const refund = await Refund.findById(id);
    if (!refund) {
      return res.status(404).json({
        status: 'error',
        message: 'Refund not found',
      });
    }

    if (refund.refundStatus !== 'approved') {
      return res.status(400).json({
        status: 'error',
        message: 'Only approved refunds can be processed',
      });
    }

    // Update refund status
    refund.refundStatus = 'processed';
    
    // Add processing details
    refund.processingDetails = {
      transactionId,
      processedAt: new Date(),
      processor: req.user.name,
      notes: processingNotes || '',
    };

    // Add admin action log
    refund.adminActionLog.push({
      adminId: req.user.id,
      action: 'processed',
      notes: `Transaction ID: ${transactionId}${processingNotes ? ` - ${processingNotes}` : ''}`,
      timestamp: new Date(),
    });

    // Add to timeline
    refund.refundTimeline.push({
      status: 'processed',
      timestamp: new Date(),
      message: `Refund processed: Transaction ${transactionId}`,
      updatedBy: req.user.id,
    });

    refund.actualProcessingTime = new Date();
    await refund.save();

    // Update order
    const order = await Order.findById(refund.orderId);
    if (order) {
      order.refundInfo = {
        ...order.refundInfo,
        refundProcessed: true,
        refundProcessedDate: new Date(),
        refundTransactionId: transactionId,
      };

      if (!order.timeline) order.timeline = [];
      order.timeline.push({
        status: order.status,
        timestamp: new Date(),
        message: `Refund processed: Transaction ${transactionId}`,
      });

      await order.save();

      // Emit real-time update
      websocketService.emitRefundUpdate(order, {
        refundAmount: refund.refundAmount,
        refundStatus: 'processed',
        processedBy: req.user.id,
        processedAt: new Date(),
        transactionId
      });
    }

    // Populate and return
    await refund.populate('userId', 'name email phone');
    await refund.populate('orderId', 'total status createdAt');
    await refund.populate('adminActionLog.adminId', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Refund processed successfully',
      data: {
        refund,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to process refund',
    });
  }
};

/**
 * GET /admin/refunds/stats/summary - Get refund statistics
 */
export const getRefundStats = async (req, res) => {
  try {
    /*
     * The same window the list is showing.
     *
     * These totals were computed across every refund ever raised, whatever
     * the console had filtered to — so "Total Refunds" could not answer "how
     * much did we refund last week", which is the question it is there for.
     * The status filter is honoured for the same reason.
     */
    const { fromDate, toDate, status } = req.query;
    const match = {};
    if (fromDate || toDate) {
      const range = {};
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;
      if (from && !Number.isNaN(from.getTime())) range.$gte = from;
      if (to && !Number.isNaN(to.getTime())) {
        /*
         * A date with no time means the whole of that day, not its first
         * instant — and the end of that day in UTC, because that is how the
         * bare date was parsed. setHours would set it in the server's local
         * zone instead, which silently moves the boundary by the offset and
         * drops the day's own refunds.
         */
        if (!/[T ]/.test(String(toDate))) to.setUTCHours(23, 59, 59, 999);
        range.$lte = to;
      }
      if (Object.keys(range).length) match.createdAt = range;
    }
    if (status && ['pending', 'approved', 'rejected', 'processed', 'completed'].includes(status)) {
      match.refundStatus = status;
    }
    // $match with an empty object is a no-op, so this is safe either way.
    const scope = [{ $match: match }];

    const [
      statusStats,
      totalStats,
      priorityStats,
      methodStats,
      monthlyStats
    ] = await Promise.all([
      // By status
      Refund.aggregate([
        ...scope,
        {
          $group: {
            _id: '$refundStatus',
            count: { $sum: 1 },
            totalAmount: { $sum: '$refundAmount' }
          }
        }
      ]),
      // Total stats
      Refund.aggregate([
        ...scope,
        {
          $group: {
            _id: null,
            totalRefunds: { $sum: 1 },
            totalAmount: { $sum: '$refundAmount' },
            avgAmount: { $avg: '$refundAmount' }
          }
        }
      ]),
      // By priority
      Refund.aggregate([
        ...scope,
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 },
            totalAmount: { $sum: '$refundAmount' }
          }
        }
      ]),
      // By method
      Refund.aggregate([
        ...scope,
        {
          $group: {
            _id: '$refundMethod',
            count: { $sum: 1 },
            totalAmount: { $sum: '$refundAmount' }
          }
        }
      ]),
      // Monthly trends (last 12 months)
      Refund.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000)
            }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 },
            totalAmount: { $sum: '$refundAmount' }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } }
      ])
    ]);

    const total = totalStats[0] || { totalRefunds: 0, totalAmount: 0, avgAmount: 0 };

    res.status(200).json({
      status: 'success',
      data: {
        overview: {
          totalRefunds: total.totalRefunds,
          totalAmount: total.totalAmount,
          averageAmount: total.avgAmount
        },
        byStatus: statusStats,
        byPriority: priorityStats,
        byMethod: methodStats,
        monthlyTrends: monthlyStats
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch refund statistics',
    });
  }
};
