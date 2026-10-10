/**
 * Referrals for the admin console.
 *
 * The user-facing referral routes answer "what is my code and what have I
 * earned". This answers the operator's question instead: who referred whom,
 * what it paid out, and whether it completed.
 *
 * ReferralTransaction is the record of an actual referral being used, which is
 * what the console lists — Referral holds programme configuration, and
 * ReferralProfile holds a user's own code and running totals.
 */
import ReferralTransaction from '../../models/ReferralTransaction.js';

const DEFAULT_LIMIT = 25;

/**
 * GET /api/referrals
 * Paginated list of referral events.
 */
export const getReferrals = async (req, res) => {
  try {
    const {
      page = 1,
      limit = DEFAULT_LIMIT,
      search = '',
      status,
      from,
      to,
    } = req.query;

    const pageNumber = Math.max(1, Number(page) || 1);
    const limitNumber = Math.max(1, Number(limit) || DEFAULT_LIMIT);

    const query = {};
    if (status) query.status = status;
    if (search) {
      query.referralCode = { $regex: String(search).trim(), $options: 'i' };
    }
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(from);
      if (to) query.createdAt.$lte = new Date(to);
    }

    const total = await ReferralTransaction.countDocuments(query);
    const rows = await ReferralTransaction.find(query)
      .populate('referrerId', 'name email phone')
      .populate('referredUserId', 'name email phone')
      .populate('orderId', 'orderNumber total')
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .lean();

    return res.status(200).json({
      status: 'success',
      data: {
        referrals: rows.map((row) => ({
          _id: row._id,
          code: row.referralCode,
          status: row.status,
          rewardAmount: row.amount,
          // The console names these referrer/referee; the model uses
          // referrerId/referredUserId. Renamed here so the screen doesn't have
          // to know the storage names.
          referrer: row.referrerId,
          referee: row.referredUserId,
          orderId: row.orderId,
          completedAt: row.processedAt ?? null,
          failureReason: row.failureReason ?? null,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      },
      total,
      page: pageNumber,
      totalPages: Math.max(1, Math.ceil(total / limitNumber)),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch referrals',
      error: error.message,
    });
  }
};

/**
 * GET /api/referrals/summary
 * Totals across the programme, for the cards above the list.
 */
export const getReferralSummary = async (req, res) => {
  try {
    const rows = await ReferralTransaction.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$amount' },
        },
      },
    ]);

    let total = 0;
    let rewarded = 0;
    const byStatus = {};
    for (const row of rows) {
      total += row.count;
      rewarded += row.amount ?? 0;
      byStatus[row._id ?? 'unknown'] = { count: row.count, amount: row.amount };
    }

    // Distinct referrers is the number of people actually sharing a code,
    // which is a different question from how many referrals happened.
    const referrers = await ReferralTransaction.distinct('referrerId');

    return res.status(200).json({
      status: 'success',
      data: {
        summary: {
          totalReferrals: total,
          totalRewardPaid: rewarded,
          activeReferrers: referrers.length,
          byStatus,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Failed to summarise referrals',
      error: error.message,
    });
  }
};

export default { getReferrals, getReferralSummary };
