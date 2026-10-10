import User from '../../models/User.js';
import ReferralTransaction from '../../models/ReferralTransaction.js';
import Referral from '../../models/Referral.js';
import Order from '../../models/Order.js';
import { ensureReferralProfile, applyReferralCode, getUserReferralDashboard, createReferralInvite, getUserReferralInvites } from '../../services/referralService.js';
import mongoose from 'mongoose';

// Validate referral code - GET /api/referral/validate/:code
export const validateReferralCode = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code || !code.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Referral code is required',
      });
    }

    // Get referral program
    const referralProgram = await Referral.getReferralProgram();
    if (!referralProgram || !referralProgram.isActive) {
      return res.status(404).json({
        status: 'error',
        message: 'Referral program is not active',
      });
    }

    // Validate code format and check if it exists
    const referralCode = referralProgram.referralCodes.find(rc => 
      rc.code === code.trim().toUpperCase() && 
      !rc.isUsed && 
      (!rc.expiresAt || rc.expiresAt > new Date())
    );

    if (!referralCode) {
      return res.status(404).json({
        status: 'error',
        message: 'Invalid or expired referral code',
      });
    }

    // Get referrer details
    const referrer = await User.findById(referralCode.referrerId);
    if (!referrer) {
      return res.status(404).json({
        status: 'error',
        message: 'Referrer not found',
      });
    }

    // Check for self-referral (fraud prevention)
    const currentUserId = req.user?.id || req.user?._id;
    if (currentUserId && referrer._id.toString() === currentUserId.toString()) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot use your own referral code',
      });
    }

    // Check if user has already used a referral code
    if (currentUserId) {
      const existingReferral = referralProgram.referralHistory.find(r => 
        r.refereeId.toString() === currentUserId.toString()
      );
      
      if (existingReferral) {
        return res.status(400).json({
          status: 'error',
          message: 'You have already used a referral code',
        });
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Referral code is valid',
      data: {
        referrerName: referrer.name,
        referrerReward: referralProgram.referrerReward,
        refereeReward: referralProgram.refereeReward,
        valid: true,
        minOrderValue: referralProgram.minOrderValueForReward,
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to validate referral code',
    });
  }
};

// Process referral reward after first order - POST /api/referral/process-reward
export const processReferralReward = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        status: 'error',
        message: 'Order ID is required',
      });
    }

    // Find order
    const order = await Order.findById(orderId).populate('userId');
    if (!order) {
      return res.status(404).json({
        status: 'error',
        message: 'Order not found',
      });
    }

    const referredUser = order.userId;
    if (!referredUser.referredBy) {
      return res.status(400).json({
        status: 'error',
        message: 'User was not referred',
      });
    }

    // Get referral program
    const referralProgram = await Referral.getReferralProgram();
    if (!referralProgram || !referralProgram.isActive) {
      return res.status(400).json({
        status: 'error',
        message: 'Referral program is not active',
      });
    }

    // Check if order meets minimum value requirement
    if (order.total < referralProgram.minOrderValueForReward) {
      return res.status(400).json({
        status: 'error',
        message: `Order value must be at least ₹${referralProgram.minOrderValueForReward} to qualify for referral reward`,
      });
    }

    // Check if user has already completed first order
    if (referredUser.firstOrderCompleted) {
      return res.status(400).json({
        status: 'error',
        message: 'Referral reward already processed',
      });
    }

    // Find referrer
    const referrer = await User.findById(referredUser.referredBy);

    if (!referrer) {
      return res.status(404).json({
        status: 'error',
        message: 'Referrer not found',
      });
    }

    // Use referral program to complete the referral
    await referralProgram.completeReferral(
      referrer._id.toString(), 
      referredUser._id.toString(), 
      order._id.toString()
    );

    // Calculate rewards based on program configuration
    let referrerRewardAmount = 0;
    let refereeRewardAmount = 0;

    if (referralProgram.referrerReward.type === 'cashback') {
      referrerRewardAmount = referralProgram.referrerReward.value;
    }
    
    if (referralProgram.refereeReward.type === 'cashback') {
      refereeRewardAmount = referralProgram.refereeReward.value;
    }

    // Give rewards
    await referralProgram.giveRewards(
      referrer._id.toString(), 
      referredUser._id.toString(), 
      referrerRewardAmount, 
      refereeRewardAmount
    );

    // Update user wallet balances
    if (referrerRewardAmount > 0) {
      referrer.referralEarnings += referrerRewardAmount;
      referrer.walletBalance += referrerRewardAmount;
      await referrer.save();
    }

    if (refereeRewardAmount > 0) {
      referredUser.walletBalance += refereeRewardAmount;
      await referredUser.save();
    }

    // Update referred user's first order status
    referredUser.firstOrderCompleted = true;
    await referredUser.save();
    res.status(200).json({
      status: 'success',
      message: 'Referral reward processed successfully',
      data: {
        referrerReward: {
          type: referralProgram.referrerReward.type,
          amount: referrerRewardAmount,
        },
        refereeReward: {
          type: referralProgram.refereeReward.type,
          amount: refereeRewardAmount,
        },
        referrerName: referrer.name,
        referredUserName: referredUser.name,
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to process referral reward',
    });
  }
};

export const getMyReferralDashboard = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (user.role !== 'user') {
      return res.status(403).json({
        status: 'error',
        message: 'Referral system is available for user accounts only',
      });
    }

    const data = await getUserReferralDashboard(userId);

    return res.status(200).json({
      status: 'success',
      data,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch referral dashboard',
    });
  }
};

export const applyMyReferralCode = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    const { referralCode } = req.body;

    const result = await applyReferralCode({ userId, code: referralCode });
    if (!result.ok) {
      return res.status(400).json({
        status: 'error',
        message: result.message,
      });
    }

    return res.status(200).json({
      status: 'success',
      message: result.message,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to apply referral code',
    });
  }
};

export const getOrCreateMyReferralProfile = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    if (user.role !== 'user') {
      return res.status(403).json({
        status: 'error',
        message: 'Referral system is available for user accounts only',
      });
    }

    const profile = await ensureReferralProfile(userId);

    return res.status(200).json({
      status: 'success',
      data: {
        referralCode: profile.referralCode,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch referral profile',
    });
  }
};

export const createMyReferralInvite = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const targetType = String(req.body?.targetType || '').trim();
    if (!userId) return res.status(401).json({ status: 'error', message: 'User authentication required' });
    const user = await User.findById(userId).lean();
    if (!user || user.role !== 'user') return res.status(403).json({ status: 'error', message: 'Referral invitations are available for user accounts only' });
    const result = await createReferralInvite({ userId, targetType });
    if (!result.ok) return res.status(400).json({ status: 'error', message: result.message });
    return res.status(201).json({ status: 'success', data: { code: result.code, targetType, rewardAmount: result.rewardAmount, link: result.link, status: result.invite.status, createdAt: result.invite.createdAt } });
  } catch (error) { return res.status(500).json({ status: 'error', message: error.message || 'Failed to create referral invite' }); }
};

export const getMyReferralInvites = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ status: 'error', message: 'User authentication required' });
    const data = await getUserReferralInvites(userId);
    const config = await (await import('../../services/referralService.js')).getReferralProgramConfig();
    return res.status(200).json({ status: 'success', data: { ...data, amounts: { user: config.userReferralAmount, vendor: config.vendorReferralAmount, delivery_partner: config.deliveryReferralAmount } } });
  } catch (error) { return res.status(500).json({ status: 'error', message: error.message || 'Failed to fetch referral status' }); }
};
