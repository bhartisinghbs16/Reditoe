/**
 * Transactions and wallets for the admin console.
 *
 * The payments router already carried gateways, settlements and reports, but
 * not the two plainest questions an operator asks: what money moved, and who
 * is holding a balance. These fill that.
 */
import FinancialTransaction from '../../models/FinancialTransaction.js';
import Wallet from '../../models/Wallet.js';
import RiderWallet from '../../models/RiderWallet.js';
import User from '../../models/User.js';

const DEFAULT_LIMIT = 25;

/**
 * Maps a stored transaction onto the shape the console reads. `paymentMethod`
 * is renamed to `method`, and a refund is reported as its own type rather than
 * a flag, so a ledger row states what it is without the reader combining
 * fields.
 */
function mapTransaction(row) {
  return {
    _id: row._id,
    transactionId: row.transactionId || row.gatewayTransactionId || null,
    type: row.refundInfo?.isRefund
      ? 'refund'
      : row.settlementInfo?.isSettlement
        ? 'settlement'
        : row.type,
    amount: row.amount,
    status: row.status,
    method: row.paymentMethod,
    orderId: row.orderId,
    userId: row.userId ?? null,
    restaurantId: row.restaurantId,
    commissionAmount: row.commissionAmount,
    vendorAmount: row.vendorAmount,
    gstAmount: row.gstAmount,
    platformFee: row.platformFee,
    description: row.notes || row.adjustmentInfo?.reason || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    processedAt: row.processedAt,
  };
}

/**
 * GET /api/admin/payments
 * Paginated transaction ledger.
 */
export const getTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = DEFAULT_LIMIT,
      search = '',
      status,
      type,
      paymentMethod,
      restaurantId,
      from,
      to,
    } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Number(limit) || DEFAULT_LIMIT);

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (restaurantId) query.restaurantId = restaurantId;

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    if (search) {
      const term = String(search).trim();
      query.$or = [
        { transactionId: { $regex: term, $options: 'i' } },
        { gatewayTransactionId: { $regex: term, $options: 'i' } },
      ];
    }

    const total = await FinancialTransaction.countDocuments(query);
    const rows = await FinancialTransaction.find(query)
      .populate('orderId', 'orderNumber total status')
      .populate('restaurantId', 'name')
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .lean();

    return res.status(200).json({
      status: 'success',
      data: { payments: rows.map(mapTransaction) },
      total,
      page: pageNumber,
      totalPages: Math.max(1, Math.ceil(total / limitNumber)),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch transactions',
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/payments/summary
 * Inflow, outflow and net across the filtered range — the figures the
 * transactions screen puts above its table.
 */
export const getTransactionSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    const match = {};
    if (from || to) {
      match.createdAt = {};
      if (from) match.createdAt.$gte = new Date(from);
      if (to) match.createdAt.$lte = new Date(to);
    }

    const rows = await FinancialTransaction.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          // isRefund lives under refundInfo. Reading it flat made every
          // refund count as money coming in, and net overstate by twice the
          // refunded amount.
          inflow: {
            $sum: {
              $cond: [{ $eq: ['$refundInfo.isRefund', true] }, 0, '$amount'],
            },
          },
          outflow: {
            $sum: {
              $cond: [{ $eq: ['$refundInfo.isRefund', true] }, '$amount', 0],
            },
          },
          commission: { $sum: '$commissionAmount' },
          gst: { $sum: '$gstAmount' },
          platformFee: { $sum: '$platformFee' },
        },
      },
    ]);

    const summary = rows[0] ?? {
      count: 0,
      inflow: 0,
      outflow: 0,
      commission: 0,
      gst: 0,
      platformFee: 0,
    };

    return res.status(200).json({
      status: 'success',
      data: {
        summary: {
          count: summary.count,
          inflow: summary.inflow,
          outflow: summary.outflow,
          net: summary.inflow - summary.outflow,
          commission: summary.commission,
          gst: summary.gst,
          platformFee: summary.platformFee,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to summarise transactions',
      error: error.message,
    });
  }
};

/**
 * GET /api/admin/payments/wallets
 *
 * Customer and rider wallets are separate collections with different field
 * names. They are normalised here so the console shows one balance sheet
 * rather than making the reader hold two shapes in their head.
 */
export const getWallets = async (req, res) => {
  try {
    const {
      page = 1,
      limit = DEFAULT_LIMIT,
      ownerType,
      search = '',
    } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Number(limit) || DEFAULT_LIMIT);

    const wallets = [];

    if (!ownerType || ownerType === 'customer') {
      const customerWallets = await Wallet.find({})
        .populate('userId', 'name email phone')
        .lean();

      for (const wallet of customerWallets) {
        wallets.push({
          _id: wallet._id,
          ownerType: 'customer',
          userId: wallet.userId,
          balance: wallet.balance ?? 0,
          // The customer wallet names these differently to the rider wallet.
          totalCredited: wallet.totalAdded ?? 0,
          totalDebited: wallet.totalSpent ?? 0,
          // A frozen wallet is the customer equivalent of inactive.
          isActive: !wallet.isFrozen,
          freezeReason: wallet.freezeReason ?? null,
          currency: wallet.currency ?? 'INR',
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt ?? wallet.lastUpdated,
        });
      }
    }

    if (!ownerType || ownerType === 'rider') {
      const riderWallets = await RiderWallet.find({})
        .populate('riderId', 'name email phone')
        .lean();

      for (const wallet of riderWallets) {
        wallets.push({
          _id: wallet._id,
          ownerType: 'rider',
          riderId: wallet.riderId,
          balance: wallet.balance ?? 0,
          totalCredited: wallet.totalEarnings ?? 0,
          totalDebited: wallet.totalWithdrawn ?? 0,
          // RiderWallet has no frozen/active flag, so a rider wallet is always live.
          isActive: true,
          currency: 'INR',
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt,
        });
      }
    }

    let visible = wallets;
    if (search) {
      const term = String(search).trim().toLowerCase();
      visible = wallets.filter((wallet) => {
        const owner = wallet.userId ?? wallet.riderId;
        if (!owner || typeof owner !== 'object') return false;
        return [owner.name, owner.email, owner.phone]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(term));
      });
    }

    // Largest balances first — the ones with money in them are the ones an
    // operator is looking for.
    visible.sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0));

    const start = (pageNumber - 1) * limitNumber;
    const paged = visible.slice(start, start + limitNumber);

    return res.status(200).json({
      status: 'success',
      data: { wallets: paged },
      total: visible.length,
      page: pageNumber,
      totalPages: Math.max(1, Math.ceil(visible.length / limitNumber)),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch wallets',
      error: error.message,
    });
  }
};

export default { getTransactions, getTransactionSummary, getWallets };
