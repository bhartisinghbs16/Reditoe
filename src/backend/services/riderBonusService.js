import RiderWallet from '../models/RiderWallet.js';

/**
 * Releasing a rider's bonus, one delivery at a time.
 *
 * A joining or referral bonus is credited to a rider as wallet money that
 * cannot be withdrawn. Each completed delivery converts a fixed amount of it
 * into withdrawable balance - the client's figure is 15 rupees per order.
 *
 * That is the whole point of the arrangement: the bonus rewards riding, so it
 * is released by riding. Paying it out on the day somebody signs up rewards
 * signing up, which is a different and much more expensive thing.
 *
 * His worked example: a rider with 1,000 in bonus who completes 10 orders and
 * earns 5,000 can withdraw 5,150, and 850 of bonus remains.
 */

/** Released per completed delivery. */
export const CONVERSION_PER_ORDER = 15;

const round = (n) => Number(Number(n || 0).toFixed(2));

/**
 * Converts one delivery's worth of bonus into withdrawable balance.
 *
 * Converts whatever is left when the remaining bonus is smaller than the
 * per-order figure, rather than skipping it - a rider with 7 rupees of bonus
 * left should get the 7, not nothing.
 *
 * Returns what was moved, so the caller can record it against the order.
 */
export const releaseBonusForOrder = async ({ riderId, orderId, perOrder = CONVERSION_PER_ORDER }) => {
  if (!riderId) return { converted: 0 };

  const wallet = await RiderWallet.findOne({ riderId });
  if (!wallet || wallet.bonusBalance <= 0) return { converted: 0 };

  const converted = round(Math.min(perOrder, wallet.bonusBalance));
  if (converted <= 0) return { converted: 0 };

  wallet.bonusBalance = round(wallet.bonusBalance - converted);
  wallet.balance = round(wallet.balance + converted);
  wallet.bonusConverted = round(wallet.bonusConverted + converted);
  wallet.bonusLedger.push({
    type: 'converted',
    amount: converted,
    note: `Released on a completed delivery`,
    orderId: orderId ?? null,
    at: new Date(),
  });

  await wallet.save();

  return {
    converted,
    bonusRemaining: wallet.bonusBalance,
    withdrawable: wallet.balance,
  };
};

/**
 * Credits a bonus, which is not withdrawable until it has been ridden for.
 *
 * The reason is required rather than optional: an amount appearing in a
 * rider's wallet with no explanation is the first thing they will ask about,
 * and the last thing anybody will remember.
 */
export const creditBonus = async ({ riderId, amount, type, note, by }) => {
  const value = round(amount);
  if (!riderId || !Number.isFinite(value) || value <= 0) {
    throw new Error('A rider and a positive amount are required');
  }
  if (!['joining_bonus', 'referral_bonus', 'admin_adjustment'].includes(type)) {
    throw new Error('Choose why this is being credited');
  }

  const wallet = await RiderWallet.findOneAndUpdate(
    { riderId },
    {
      $inc: { bonusBalance: value },
      $push: {
        bonusLedger: { type, amount: value, note: note ?? '', by: by ?? null, at: new Date() },
      },
      $setOnInsert: { balance: 0, totalEarnings: 0, totalWithdrawn: 0 },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return {
    bonusBalance: wallet.bonusBalance,
    withdrawable: wallet.balance,
  };
};

/** What a rider may withdraw right now, and what is still locked. */
export const withdrawableFor = async (riderId) => {
  const wallet = await RiderWallet.findOne({ riderId });
  return {
    withdrawable: round(wallet?.balance ?? 0),
    bonusLocked: round(wallet?.bonusBalance ?? 0),
    bonusReleased: round(wallet?.bonusConverted ?? 0),
    perOrder: CONVERSION_PER_ORDER,
  };
};

export default { releaseBonusForOrder, creditBonus, withdrawableFor, CONVERSION_PER_ORDER };
