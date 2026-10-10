import Refund from '../../models/Refund.js';
import Order from '../../models/Order.js';

/**
 * The customer's own refunds.
 *
 * `/api/refunds` is admin-scoped and rejects a customer token with "Invalid
 * user role", so the app's Returns & Refunds screen had nothing to read. This
 * is the same data filtered to the signed-in user.
 */

/** The screen groups by these three, so the API names them the same way. */
const STATUS_LABEL = {
  pending: 'Request Received',
  requested: 'Request Received',
  approved: 'Refund In Progress',
  processing: 'Refund In Progress',
  completed: 'Refund Completed',
  refunded: 'Refund Completed',
  rejected: 'Request Rejected',
  failed: 'Refund Failed',
};

/*
 * The stored field names are refundAmount / refundReason / refundStatus. This
 * read refund.amount, refund.reason and refund.status, none of which exist on
 * the document, so every refund came back with an undefined amount, no reason
 * and no status - and the status label fell through to undefined with it.
 *
 * The richer progress ("Refund In Progress", "Refund Completed") lives on the
 * last refundTimeline entry; refundStatus itself only knows pending, approved
 * and rejected.
 */
const present = (refund) => {
  const latest = refund.refundTimeline?.length
    ? refund.refundTimeline[refund.refundTimeline.length - 1]
    : null;
  const state = latest?.status || refund.refundStatus || 'pending';

  return {
    id: refund._id,
    refundId: refund.refundId,
    orderId: refund.orderId?._id || refund.orderId,
    orderCode: refund.orderId?.orderNumber || refund.orderId?.orderId || null,
    restaurantName: refund.orderId?.restaurantId?.name || null,
    amount: refund.refundAmount,
    reason: refund.refundReason,
    note: latest?.message || null,
    status: state,
    statusLabel: STATUS_LABEL[state] || state,
    requestedAt: refund.createdAt,
    resolvedAt: refund.processingDetails?.processedAt || null,
  };
};

/** GET /api/refunds/my */
export const getMyRefunds = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 20);

    const query = { userId: req.user._id };
    if (req.query.status) query.refundStatus = req.query.status;

    const [refunds, total] = await Promise.all([
      Refund.find(query)
        .populate({
          path: 'orderId',
          select: 'orderNumber orderId restaurantId',
          populate: { path: 'restaurantId', select: 'name' },
        })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Refund.countDocuments(query),
    ]);

    res.json({
      status: 'success',
      results: refunds.length,
      data: {
        refunds: refunds.map(present),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/** GET /api/refunds/my/summary — the three figures at the top of the screen. */
export const getMyRefundSummary = async (req, res) => {
  try {
    const rows = await Refund.aggregate([
      { $match: { userId: req.user._id } },
      { $group: { _id: '$refundStatus', count: { $sum: 1 }, amount: { $sum: '$refundAmount' } } },
    ]);

    const countFor = (statuses) =>
      rows
        .filter((row) => statuses.includes(row._id))
        .reduce((sum, row) => sum + row.count, 0);

    res.json({
      status: 'success',
      data: {
        summary: {
          raised: rows.reduce((sum, row) => sum + row.count, 0),
          completed: countFor(['completed', 'refunded']),
          inProgress: countFor(['approved', 'processing', 'pending', 'requested']),
          totalRefunded: rows
            .filter((row) => ['completed', 'refunded'].includes(row._id))
            .reduce((sum, row) => sum + row.amount, 0),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
};

/**
 * POST /api/refunds/request - the customer raises a refund on their own order.
 *
 * There was no way to do this. The Returns & Refunds screen listed a
 * hard-coded sample history, and every route that could create a refund was
 * behind adminProtect, so a customer asking for their money back reached
 * nobody - which is why nothing ever showed up in the admin panel's Refund
 * Requests.
 *
 * Raised, never granted. The refund is created as `pending` with a `requested`
 * timeline entry, exactly as an admin-initiated one is, and it is the admin
 * side that approves, rejects and settles it. Nothing is paid out here.
 */
export const requestRefund = async (req, res) => {
  try {
    const { orderId, reason, amount } = req.body || {};
    const userId = req.user._id;

    if (!orderId || !reason || !String(reason).trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Please choose the order and tell us why you are asking for a refund.',
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ status: 'error', message: 'Order not found' });
    }
    if (order.userId.toString() !== userId.toString()) {
      return res.status(403).json({
        status: 'error',
        message: 'That is not your order.',
      });
    }

    // Nothing was ever taken for an unpaid order, so there is nothing to give
    // back - and a refund raised against one would be approved against no
    // payment at all.
    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({
        status: 'error',
        message: 'This order has not been paid for, so there is nothing to refund.',
      });
    }

    const existing = await Refund.findOne({ orderId });
    if (existing) {
      return res.status(409).json({
        status: 'error',
        message: 'A refund has already been raised for this order.',
      });
    }

    // The customer may ask for part of the order back, but never for more than
    // they paid; asking for nothing at all means the whole order.
    const requested = Number(amount);
    const refundAmount =
      Number.isFinite(requested) && requested > 0
        ? Math.min(requested, Number(order.total))
        : Number(order.total);

    const refund = new Refund({
      orderId: order._id,
      userId,
      refundAmount,
      refundReason: String(reason).trim(),
      refundStatus: 'pending',
      refundMethod: order.paymentMethod === 'wallet' ? 'wallet' : 'original_payment',
      refundTimeline: [
        {
          status: 'requested',
          timestamp: new Date(),
          message: `Refund requested by the customer: ₹${refundAmount} - ${String(reason).trim()}`,
          updatedBy: userId,
        },
      ],
    });

    await refund.save();
    await refund.populate({
      path: 'orderId',
      select: 'orderNumber orderId restaurantId',
      populate: { path: 'restaurantId', select: 'name' },
    });

    return res.status(201).json({
      status: 'success',
      message: 'Your refund request has been raised. We will review it shortly.',
      data: { refund: present(refund) },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Could not raise the refund request',
    });
  }
};
