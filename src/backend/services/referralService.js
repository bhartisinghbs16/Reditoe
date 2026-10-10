import mongoose from 'mongoose';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Referral from '../models/Referral.js';
import ReferralProfile from '../models/ReferralProfile.js';
import ReferralReward from '../models/ReferralReward.js';
import Wallet from '../models/Wallet.js';
import WalletTransaction from '../models/WalletTransaction.js';
import Settings from '../models/Settings.js';
import ReferralInvite from '../models/ReferralInvite.js';

const normalizeCode = (code) => (code || '').toString().trim().toUpperCase();

const generateCandidateCode = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i += 1) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
};

export const ensureReferralProfile = async (userId) => {
  const userObjectId = new mongoose.Types.ObjectId(userId);

  let profile = await ReferralProfile.findOne({ userId: userObjectId });
  if (profile) return profile;

  // Generate unique referral code
  // Format: VIN-XXXXXXXX (uppercase, no ambiguous chars)
  let referralCode = `VIN-${generateCandidateCode()}`;
  // Prevent rare collisions
  for (let i = 0; i < 5; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await ReferralProfile.findOne({ referralCode });
    if (!exists) break;
    referralCode = `VIN-${generateCandidateCode()}`;
  }

  profile = await ReferralProfile.create({
    userId: userObjectId,
    referralCode,
  });

  return profile;
};

export const getReferralProgramConfig = async () => {
  try {
    // First try Settings.referralSettings
    const settings = await Settings.findOne({}).lean();
    const referralSettings = settings?.referralSettings;

    // Also get program details from Referral model
    const program = await Referral.findOne({
      isActive: true
    }).lean();

    return {
      programName: program?.programName ||
                   'Reditoe Referral Program',
      description: program?.description ||
                   'Invite friends and earn rewards!',
      // Use admin Settings amounts - fallback to Referral model - fallback to hardcoded
      referrerRewardAmount:
        referralSettings?.referrerAmount ??
        program?.referrerReward?.value ??
        50,
      userReferralAmount: referralSettings?.userReferralAmount ?? referralSettings?.referrerAmount ?? program?.referrerReward?.value ?? 0,
      vendorReferralAmount: referralSettings?.vendorReferralAmount ?? referralSettings?.referrerAmount ?? program?.referrerReward?.value ?? 0,
      deliveryReferralAmount: referralSettings?.deliveryReferralAmount ?? referralSettings?.referrerAmount ?? program?.referrerReward?.value ?? 0,
      refereeRewardAmount:
        referralSettings?.refereeAmount ??
        program?.refereeReward?.value ??
        0,
      minOrderValue:
        program?.minOrderValueForReward ?? 0,
      rules: program?.rules ?? [],
      // creditAfterDelivery setting
      creditAfterDelivery:
        referralSettings?.creditAfterDelivery ?? true,
      enabled: referralSettings?.enabled ?? true,
    };
  } catch (err) {
    return {
      programName: 'Reditoe Referral Program',
      description: 'Invite friends and earn rewards!',
      referrerRewardAmount: 50,
      userReferralAmount: 0,
      vendorReferralAmount: 0,
      deliveryReferralAmount: 0,
      refereeRewardAmount: 0,
      minOrderValue: 0,
      rules: [],
      creditAfterDelivery: true,
      enabled: true,
    };
  }
};

export const getReferralTargetAmount = async (targetType) => {
  const settings = await Settings.findOne({}).lean();
  const r = settings?.referralSettings || {};
  if (targetType === 'vendor') return Number(r.vendorReferralAmount ?? r.referrerAmount ?? 0);
  if (targetType === 'delivery_partner') return Number(r.deliveryReferralAmount ?? r.referrerAmount ?? 0);
  return Number(r.userReferralAmount ?? r.referrerAmount ?? 0);
};

export const createReferralInvite = async ({ userId, targetType }) => {
  if (!['user', 'vendor', 'delivery_partner'].includes(targetType)) {
    return { ok: false, message: 'Invalid referral target' };
  }
  const config = await getReferralProgramConfig();
  if (!config.enabled) return { ok: false, message: 'Referral programme is currently disabled' };
  const rewardAmount = await getReferralTargetAmount(targetType);
  const prefix = targetType === 'vendor' ? 'VEN' : targetType === 'delivery_partner' ? 'RDR' : 'USR';
  let code = '';
  for (let i = 0; i < 8; i += 1) {
    code = `REF-${prefix}-${generateCandidateCode()}`;
    // eslint-disable-next-line no-await-in-loop
    if (!(await ReferralInvite.exists({ code }))) break;
  }
  const invite = await ReferralInvite.create({ referrerUserId: userId, targetType, code, rewardAmount });
  const publicBase = String(process.env.PUBLIC_REFERRAL_BASE_URL || 'https://api.reditoe.com/api/referral/open').replace(/\/$/, '');
  const link = `${publicBase}/${encodeURIComponent(code)}`;
  return { ok: true, invite, code, rewardAmount, link };
};

export const getUserReferralInvites = async (userId) => {
  const invites = await ReferralInvite.find({ referrerUserId: userId }).sort({ createdAt: -1 }).lean();
  const totals = invites.reduce((acc, row) => {
    acc.total += 1;
    acc[row.targetType] = (acc[row.targetType] || 0) + 1;
    if (row.status === 'rewarded') acc.earned += Number(row.rewardAmount || 0);
    return acc;
  }, { total: 0, user: 0, vendor: 0, delivery_partner: 0, earned: 0 });
  return { invites, totals };
};

export const registerReferralInvite = async ({ code, targetType, entityId }) => {
  const invite = await ReferralInvite.findOne({ code: normalizeCode(code), targetType });
  if (!invite) return null;
  if (invite.status !== 'invited') return invite;
  invite.status = 'registered';
  invite.referredEntityId = entityId;
  invite.registeredAt = new Date();
  await invite.save();
  return invite;
};

export const approveReferralInvite = async ({ entityId, targetType, approved = true }) => {
  const invite = await ReferralInvite.findOne({ referredEntityId: entityId, targetType, status: 'registered' });
  if (!invite) return null;
  if (!approved) { invite.status = 'rejected'; await invite.save(); return invite; }
  invite.status = 'approved';
  invite.approvedAt = new Date();
  await invite.save();
  return creditReferralInvite(invite._id);
};

export const creditReferralInvite = async (inviteId) => {
  const invite = await ReferralInvite.findById(inviteId);
  if (!invite || !['approved', 'registered'].includes(invite.status) || invite.status === 'rewarded') return invite;
  if (invite.rewardAmount <= 0) { invite.status = 'rewarded'; invite.rewardedAt = new Date(); await invite.save(); return invite; }
  const walletBefore = await User.findById(invite.referrerUserId).select('walletBalance').lean();
  await User.findByIdAndUpdate(invite.referrerUserId, { $inc: { walletBalance: invite.rewardAmount, referralEarnings: invite.rewardAmount } });
  const wallet = await Wallet.findOneAndUpdate({ userId: invite.referrerUserId }, {
    $inc: { balance: invite.rewardAmount },
    $set: { lastUpdated: new Date(), lastTransactionAt: new Date() },
  }, { new: true, upsert: true, setDefaultsOnInsert: true });
  const tx = await WalletTransaction.create({
    userId: invite.referrerUserId, amount: invite.rewardAmount, type: 'credit', category: 'referral',
    description: `Referral reward — ${invite.targetType.replace('_', ' ')}`, status: 'completed',
    balanceBefore: Number(walletBefore?.walletBalance || 0), balanceAfter: Number(wallet?.balance || invite.rewardAmount),
    processor: 'system', metadata: { referralInviteId: invite._id, targetType: invite.targetType, code: invite.code },
  });
  invite.status = 'rewarded';
  invite.rewardedAt = new Date();
  invite.rewardTransactionId = tx._id;
  await invite.save();
  return invite;
};

export const applyReferralCode = async ({ userId, code }) => {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return { ok: false, message: 'Referral code is required' };
  }

  const user = await User.findById(userId).lean();
  if (!user) return { ok: false, message: 'User not found' };
  if (user.role !== 'user') return { ok: false, message: 'Referral is available for user accounts only' };

  const profile = await ensureReferralProfile(userId);

  if (profile.appliedReferralCode) {
    return { ok: false, message: 'Referral code already applied' };
  }

  if (profile.referralCode === normalized) {
    return { ok: false, message: 'You cannot use your own referral code' };
  }

  const hasAnyOrder = await Order.exists({ userId });
  if (hasAnyOrder) {
    return { ok: false, message: 'Referral code can only be applied before your first order' };
  }

  const invite = await ReferralInvite.findOne({ code: normalized, targetType: 'user' }).lean();
  const referrerProfile = invite
    ? await ReferralProfile.findOne({ userId: invite.referrerUserId }).lean()
    : await ReferralProfile.findOne({ referralCode: normalized }).lean();
  if (!referrerProfile && !invite) {
    return { ok: false, message: 'Invalid referral code' };
  }

  const referrerUser = await User.findById(invite?.referrerUserId || referrerProfile.userId).lean();
  if (!referrerUser || referrerUser.role !== 'user') {
    return { ok: false, message: 'Invalid referral code' };
  }

  await ReferralProfile.updateOne(
    { _id: profile._id },
    {
      $set: {
        appliedReferralCode: normalized,
        referrerUserId: invite?.referrerUserId || referrerProfile.userId,
        appliedAt: new Date(),
      },
    }
  );

  if (invite) {
    await ReferralInvite.updateOne({ _id: invite._id, status: 'invited' }, {
      $set: { status: 'registered', referredEntityId: userId, registeredAt: new Date() },
    });
  }

  return {
    ok: true,
    message: 'Referral code applied successfully',
    referrer: {
      userId: referrerProfile.userId,
    },
  };
};

export const getUserReferralDashboard = async (userId) => {
  const user = await User.findById(userId).lean();
  if (!user) return null;

  const profile = await ensureReferralProfile(userId);
  const config = await getReferralProgramConfig();

  const referrals = await ReferralProfile.find({ referrerUserId: userId })
    .populate('userId', 'name email')
    .sort({ appliedAt: -1 })
    .lean();

  const rewards = await ReferralReward.find({ referrerUserId: userId })
    .sort({ createdAt: -1 })
    .lean();

  const totalReferrals = referrals.length;
  const completedReferrals = rewards.filter(r => r.status === 'credited').length;

  return {
    referralCode: profile.referralCode,
    canApplyReferralCode: !profile.appliedReferralCode && !(await Order.exists({ userId })),
    appliedReferralCode: profile.appliedReferralCode,
    program: {
      programName: config.programName,
      description: config.description,
      referrerRewardAmount: config.referrerRewardAmount,
      refereeRewardAmount: config.refereeRewardAmount,
      rules: config.rules,
    },
    stats: {
      totalReferrals,
      successfulReferrals: completedReferrals,
      totalRewards: rewards
        .filter(r => r.status === 'credited')
        .reduce((sum, r) => sum + (r.referrerRewardAmount || 0), 0),
    },
    referralList: referrals.map(r => ({
      refereeUserId: r.userId?._id,
      name: r.userId?.name || 'User',
      email: r.userId?.email,
      appliedAt: r.appliedAt,
      status: rewards.find(x => x.refereeUserId?.toString?.() === r.userId?._id?.toString?.())?.status || 'pending',
    })),
  };
};

export const processReferralOnDeliveredOrder = async (order) => {
  // Verify order is actually delivered
  if (order.status !== 'Delivered') {
    console.log('Referral: order not delivered, skipping');
    return;
  }

  if (!order?.userId || !order?._id) return;

  const userId = order.userId.toString();

  const profile = await ReferralProfile.findOne({ userId }).lean();
  if (!profile?.referrerUserId || !profile?.appliedReferralCode) return;
  const config = await getReferralProgramConfig();

  // Check creditAfterDelivery setting
  if (!config.creditAfterDelivery) {
    // Credit immediately without delivery check
    // Skip the deliveredCount check
  } else {
    // Only on first Delivered order
    const deliveredCount = await Order.countDocuments({
      userId,
      status: 'Delivered'
    });
    if (deliveredCount !== 1) return;
  }

  // Idempotency guard: one reward per first delivered order
  const already = await ReferralReward.findOne({ firstOrderId: order._id }).lean();
  if (already) return;
  const rewardDoc = await ReferralReward.create({
    referrerUserId: profile.referrerUserId,
    refereeUserId: userId,
    referralCode: profile.appliedReferralCode,
    firstOrderId: order._id,
    status: 'pending',
    referrerRewardAmount: config.userReferralAmount ?? config.referrerRewardAmount,
    refereeRewardAmount: config.refereeRewardAmount,
  });

  // Credit wallet balances (simple additive credit; does not alter order flow)
  const userReferralRewardAmount = Number(config.userReferralAmount ?? config.referrerRewardAmount ?? 0);

  if (userReferralRewardAmount > 0) {
    // Update User.walletBalance
    await User.findByIdAndUpdate(
      profile.referrerUserId,
      { $inc: { walletBalance: userReferralRewardAmount } }
    );

    // Update Wallet.balance
    const referrerWallet = await Wallet.findOneAndUpdate(
      { userId: profile.referrerUserId },
      {
        $inc: { balance: userReferralRewardAmount },
        $set: { lastUpdated: new Date(), lastTransactionAt: new Date() }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Create WalletTransaction
    await WalletTransaction.create({
      userId: profile.referrerUserId,
      amount: userReferralRewardAmount,
      type: 'credit',
      category: 'referral',
      description: 'Referral reward — friend completed first order',
      status: 'completed',
      orderId: order._id,
      balanceBefore: Math.max(0, (referrerWallet?.balance || 0) - userReferralRewardAmount),
      balanceAfter: referrerWallet?.balance || userReferralRewardAmount,
      processor: 'system',
      metadata: {
        referralRewardId: rewardDoc._id,
        referralCode: profile.appliedReferralCode,
        refereeUserId: userId,
        reference: order._id,
      },
    });
  }

  if (config.refereeRewardAmount > 0) {
    // Update User.walletBalance
    await User.findByIdAndUpdate(
      userId,
      { $inc: { walletBalance: config.refereeRewardAmount } }
    );

    // Update Wallet.balance
    const refereeWallet = await Wallet.findOneAndUpdate(
      { userId: userId },
      {
        $inc: { balance: config.refereeRewardAmount },
        $set: { lastUpdated: new Date(), lastTransactionAt: new Date() }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Create WalletTransaction
    await WalletTransaction.create({
      userId: userId,
      amount: config.refereeRewardAmount,
      type: 'credit',
      category: 'referral',
      description: 'Referral reward — welcome bonus for joining',
      status: 'completed',
      orderId: order._id,
      balanceBefore: Math.max(0, (refereeWallet?.balance || 0) - config.refereeRewardAmount),
      balanceAfter: refereeWallet?.balance || config.refereeRewardAmount,
      processor: 'system',
      metadata: {
        referralRewardId: rewardDoc._id,
        referralCode: profile.appliedReferralCode,
        referrerUserId: profile.referrerUserId,
        reference: order._id,
      },
    });
  }

  await ReferralReward.updateOne(
    { _id: rewardDoc._id },
    { $set: { status: 'credited', creditedAt: new Date() } }
  );

  await ReferralInvite.updateOne(
    { code: profile.appliedReferralCode, targetType: 'user', referredEntityId: userId, status: { $in: ['registered', 'approved'] } },
    { $set: { status: 'rewarded', rewardedAt: new Date() } }
  );
};
