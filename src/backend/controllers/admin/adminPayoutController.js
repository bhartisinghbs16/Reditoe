/**
 * Admin payout controller. List payouts for dashboard.
 * Uses Payout collection (new) - does not modify existing collections.
 */
import Payout from '../../models/Payout.js';
import Order from '../../models/Order.js';
import Restaurant from '../../models/Restaurant.js';
import mongoose from 'mongoose';

function getCommissionPercent() {
  const raw = process.env.PLATFORM_COMMISSION_PERCENT;
  const parsed = raw ? Number(raw) : NaN;
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return 10;
}

/**
 * GET /admin/payouts - List all payouts (paginated, filterable)
 */
export const getPayouts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const status = req.query.status; // optional: pending | completed | failed

    const filter = {};
    if (status && ['pending', 'completed', 'failed'].includes(status)) {
      filter.status = status;
    }

    const [payouts, total] = await Promise.all([
      Payout.find(filter)
        .populate('restaurantId', 'name image address')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Payout.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      results: payouts.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        payouts,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch payouts',
    });
  }
};

/**
 * GET /admin/restaurants/:id/payouts
 *
 * One restaurant's payout and settlement position, to read.
 *
 * The console's Payout & Settlement tab sent staff to the platform-wide
 * payouts screen, where they then had to find this vendor among all the
 * others. Nothing here pays anybody: paying is done from Finance, on purpose,
 * so that looking at a vendor's position and moving money remain separate
 * actions.
 */
export const getRestaurantPayouts = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid restaurant ID' });
    }

    const restaurant = await Restaurant.findById(id)
      .select('name commissionPercent settlementInfo settlementLock bankDetails charges')
      .lean();
    if (!restaurant) {
      return res.status(404).json({ status: 'error', message: 'Restaurant not found' });
    }

    const restaurantId = new mongoose.Types.ObjectId(id);

    const [payouts, totals, settledOrderIds] = await Promise.all([
      Payout.find({ restaurantId }).sort({ createdAt: -1 }).limit(20).lean(),
      Payout.aggregate([
        { $match: { restaurantId } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            gross: { $sum: { $ifNull: ['$grossAmount', 0] } },
            commission: { $sum: { $ifNull: ['$commissionAmount', 0] } },
            net: { $sum: { $ifNull: ['$netAmount', 0] } },
          },
        },
      ]),
      Payout.distinct('orderIds', { restaurantId }),
    ]);

    /*
     * What is owed but not yet on any payout. Counted exactly as the payout
     * generator counts it - delivered orders, on subtotal rather than total,
     * because delivery fees and tips are not the restaurant's money - so this
     * figure and the one Finance acts on cannot drift apart.
     */
    const commissionPercent = Number.isFinite(Number(restaurant.commissionPercent))
      ? Number(restaurant.commissionPercent)
      : getCommissionPercent();

    const [unsettled] = await Order.aggregate([
      {
        $match: {
          restaurantId,
          status: 'Delivered',
          ...(settledOrderIds.length ? { _id: { $nin: settledOrderIds } } : {}),
        },
      },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          gross: { $sum: { $ifNull: ['$subtotal', 0] } },
          firstOrderAt: { $min: '$createdAt' },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
    ]);

    const round = (value) => Number(Number(value || 0).toFixed(2));
    const pendingGross = round(unsettled?.gross);
    const pendingCommission = round((pendingGross * commissionPercent) / 100);

    const byStatus = Object.fromEntries(
      totals.map((row) => [
        row._id,
        {
          count: row.count,
          gross: round(row.gross),
          commission: round(row.commission),
          net: round(row.net),
        },
      ])
    );

    const bank = restaurant.settlementInfo?.bankDetails?.accountNumber
      ? restaurant.settlementInfo.bankDetails
      : restaurant.bankDetails || {};

    return res.status(200).json({
      status: 'success',
      data: {
        terms: {
          commissionPercent,
          frequency: restaurant.settlementInfo?.defaultFrequency ?? 'weekly',
          settlementDay: restaurant.settlementInfo?.settlementDay ?? null,
          minimumThreshold: restaurant.settlementInfo?.minimumThreshold ?? 0,
          autoSettlement: Boolean(restaurant.settlementInfo?.autoSettlement),
          settlementLock: Boolean(restaurant.settlementLock),
        },
        /*
         * Enough of the account to recognise it, not enough to use it. This
         * screen is for reading a position, and a full account number on it
         * is a liability on every screen it is left open on.
         */
        bank: {
          accountHolderName: bank.accountHolderName || null,
          bankName: bank.bankName || null,
          ifsc: bank.ifsc || null,
          accountNumberLast4: bank.accountNumber
            ? String(bank.accountNumber).slice(-4)
            : null,
        },
        summary: {
          paid: byStatus.completed ?? { count: 0, gross: 0, commission: 0, net: 0 },
          awaitingPayment: byStatus.pending ?? { count: 0, gross: 0, commission: 0, net: 0 },
          failed: byStatus.failed ?? { count: 0, gross: 0, commission: 0, net: 0 },
          notYetOnAPayout: {
            orders: unsettled?.orders ?? 0,
            gross: pendingGross,
            commission: pendingCommission,
            net: round(pendingGross - pendingCommission),
            firstOrderAt: unsettled?.firstOrderAt ?? null,
            lastOrderAt: unsettled?.lastOrderAt ?? null,
          },
        },
        payouts: payouts.map((payout) => ({
          id: payout._id,
          orders: payout.orderIds?.length ?? 0,
          grossAmount: round(payout.grossAmount),
          commissionAmount: round(payout.commissionAmount),
          netAmount: round(payout.netAmount),
          status: payout.status,
          payoutMethod: payout.payoutMethod || null,
          transactionId: payout.transactionId || null,
          notes: payout.notes || null,
          createdAt: payout.createdAt,
          updatedAt: payout.updatedAt,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch payouts for this restaurant',
    });
  }
};

/**
 * POST /admin/payouts/generate - Generate payouts for Delivered orders not already in any payout
 * Creates ONE payout per restaurant.
 */
export const generatePayouts = async (req, res) => {
  try {
    const commissionPercent = getCommissionPercent();

    const alreadyPaidOrderIds = await Payout.distinct('orderIds');

    const grouped = await Order.aggregate([
      {
        $match: {
          status: 'Delivered',
          ...(alreadyPaidOrderIds && alreadyPaidOrderIds.length > 0
            ? { _id: { $nin: alreadyPaidOrderIds } }
            : {}),
        },
      },
      {
        $group: {
          _id: '$restaurantId',
          orderIds: { $push: '$_id' },
          // Use subtotal (food revenue only), NOT total which includes delivery fee/tip/platform fee
          grossAmount: { $sum: '$subtotal' },
        },
      },
    ]);

    if (!grouped || grouped.length === 0) {
      return res.status(200).json({
        status: 'success',
        message: 'No eligible delivered orders found for payout generation',
        data: {
          payouts: [],
        },
      });
    }

    const docs = grouped
      .filter((g) => g._id && mongoose.Types.ObjectId.isValid(String(g._id)))
      .map((g) => {
        const grossAmount = Number(g.grossAmount) || 0;
        const commissionAmount = Number(((grossAmount * commissionPercent) / 100).toFixed(2));
        const netAmount = Number((grossAmount - commissionAmount).toFixed(2));
        return {
          restaurantId: g._id,
          orderIds: g.orderIds || [],
          grossAmount,
          commissionAmount,
          netAmount,
          status: 'pending',
          payoutMethod: 'manual',
        };
      })
      .filter((d) => Array.isArray(d.orderIds) && d.orderIds.length > 0);

    if (docs.length === 0) {
      return res.status(200).json({
        status: 'success',
        message: 'No eligible delivered orders found for payout generation',
        data: {
          payouts: [],
        },
      });
    }

    const created = await Payout.insertMany(docs, { ordered: false });

    const populated = await Payout.find({ _id: { $in: created.map((p) => p._id) } })
      .populate('restaurantId', 'name image address')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(201).json({
      status: 'success',
      message: 'Payouts generated successfully',
      results: populated.length,
      data: {
        payouts: populated,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to generate payouts',
    });
  }
};

/**
 * PATCH /admin/payouts/:id/status - Update payout status (manual settlement)
 * Body: { status: 'pending'|'completed'|'failed', payoutMethod?, transactionId?, notes? }
 */
export const updatePayoutStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payoutMethod, transactionId, notes } = req.body || {};

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payout ID',
      });
    }

    if (!status || !['pending', 'completed', 'failed'].includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Status must be one of: pending, completed, failed',
      });
    }

    if (payoutMethod && !['bank', 'manual'].includes(payoutMethod)) {
      return res.status(400).json({
        status: 'error',
        message: 'payoutMethod must be one of: bank, manual',
      });
    }

    const payout = await Payout.findById(id);
    if (!payout) {
      return res.status(404).json({
        status: 'error',
        message: 'Payout not found',
      });
    }

    payout.status = status;
    if (payoutMethod) payout.payoutMethod = payoutMethod;
    if (typeof transactionId === 'string') payout.transactionId = transactionId;
    if (typeof notes === 'string') payout.notes = notes;

    await payout.save();
    await payout.populate('restaurantId', 'name image address');

    return res.status(200).json({
      status: 'success',
      message: 'Payout status updated',
      data: {
        payout,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update payout status',
    });
  }
};

/**
 * GET /admin/payouts/:id - Get single payout
 */
export const getPayoutById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payout ID',
      });
    }

    const payout = await Payout.findById(id)
      .populate('restaurantId', 'name image address')
      .populate('orderIds', 'total status createdAt');

    if (!payout) {
      return res.status(404).json({
        status: 'error',
        message: 'Payout not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        payout,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch payout',
    });
  }
};
