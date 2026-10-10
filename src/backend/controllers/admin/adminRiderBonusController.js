import mongoose from 'mongoose';
import User from '../../models/User.js';
import RiderWallet from '../../models/RiderWallet.js';
import { creditBonus, withdrawableFor, CONVERSION_PER_ORDER } from '../../services/riderBonusService.js';

/**
 * Putting a bonus into a rider's wallet, and seeing what it did.
 *
 * Every credit carries a reason. An amount appearing in somebody's wallet
 * with no explanation is the first thing they ask about and the last thing
 * anybody remembers, and a joining bonus that cannot be told from an
 * adjustment is an argument waiting to happen.
 */

const REASONS = {
  joining_bonus: 'Joining bonus',
  referral_bonus: 'Referral bonus',
  admin_adjustment: 'Admin adjustment',
};

/** GET /admin/riders/:id/wallet */
export const getRiderWallet = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid rider id' });
    }

    const rider = await User.findOne({ _id: id, role: 'rider' }).select('name phone');
    if (!rider) return res.status(404).json({ status: 'error', message: 'Rider not found' });

    const wallet = await RiderWallet.findOne({ riderId: id });
    const totals = await withdrawableFor(id);

    return res.status(200).json({
      status: 'success',
      data: {
        rider: { id: rider._id, name: rider.name, phone: rider.phone },
        ...totals,
        totalEarnings: wallet?.totalEarnings ?? 0,
        totalWithdrawn: wallet?.totalWithdrawn ?? 0,
        // Newest first: the last thing that happened is the thing being asked about.
        ledger: [...(wallet?.bonusLedger ?? [])]
          .sort((a, b) => new Date(b.at) - new Date(a.at))
          .slice(0, 50)
          .map((entry) => ({
            type: entry.type,
            label: REASONS[entry.type] ?? 'Released on a delivery',
            amount: entry.amount,
            note: entry.note,
            at: entry.at,
          })),
      },
    });
  } catch (error) {
    console.error('[riderWallet] read failed:', error?.message || error);
    return res.status(500).json({ status: 'error', message: 'Could not read that wallet.' });
  }
};

/** POST /admin/riders/:id/wallet/bonus  { amount, type, note } */
export const addRiderBonus = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type, note } = req.body ?? {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: 'error', message: 'Invalid rider id' });
    }
    if (!REASONS[type]) {
      return res.status(400).json({
        status: 'error',
        message: 'Choose a reason: joining bonus, referral bonus, or admin adjustment.',
      });
    }

    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ status: 'error', message: 'Enter an amount above zero.' });
    }
    // A typo of an extra zero is somebody's month. Refused rather than paid.
    if (value > 100000) {
      return res.status(400).json({
        status: 'error',
        message: 'That is over ₹1,00,000. If it is right, add it in smaller amounts.',
      });
    }

    const rider = await User.findOne({ _id: id, role: 'rider' }).select('_id name');
    if (!rider) return res.status(404).json({ status: 'error', message: 'Rider not found' });

    const result = await creditBonus({
      riderId: id,
      amount: value,
      type,
      note: note ?? REASONS[type],
      by: req.user?._id ?? req.user?.id ?? null,
    });

    return res.status(200).json({
      status: 'success',
      message: `₹${value} added to ${rider.name}'s wallet as ${REASONS[type].toLowerCase()}. It becomes withdrawable at ₹${CONVERSION_PER_ORDER} per completed delivery.`,
      data: result,
    });
  } catch (error) {
    console.error('[riderWallet] credit failed:', error?.message || error);
    return res.status(500).json({ status: 'error', message: 'Could not add that bonus.' });
  }
};

export default { getRiderWallet, addRiderBonus };
