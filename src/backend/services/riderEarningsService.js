/**
 * Rider Earnings Service
 * Automatically processes rider earnings when orders are completed
 */
import Order from '../models/Order.js';
import User from '../models/User.js';
import RiderWallet from '../models/RiderWallet.js';
import { releaseBonusForOrder } from './riderBonusService.js';
import RiderEarning from '../models/RiderEarning.js';
import mongoose from 'mongoose';

/**
 * Process rider earnings for a completed order
 * This should be called when an order status changes to 'Delivered'
 */
export const processRiderEarnings = async (orderId) => {
  try {
    console.log(`🔄 [processRiderEarnings] Processing earnings for order: ${orderId}`);

    // Get the order
    const order = await Order.findById(orderId);
    if (!order) {
      console.error(`❌ [processRiderEarnings] Order not found: ${orderId}`);
      return { success: false, error: 'Order not found' };
    }

    // Check if order is delivered
    if (order.status !== 'Delivered') {
      console.log(`⚠️ [processRiderEarnings] Order ${orderId} not delivered yet (status: ${order.status})`);
      return { success: false, error: 'Order not delivered' };
    }

    // Check if rider is assigned
    if (!order.riderId) {
      console.log(`⚠️ [processRiderEarnings] No rider assigned to order ${orderId}`);
      return { success: false, error: 'No rider assigned' };
    }

    // Check if earnings already processed for this order
    const existingEarning = await RiderEarning.findOne({ orderId });
    if (existingEarning) {
      console.log(`⚠️ [processRiderEarnings] Earnings already processed for order ${orderId}`);
      return { success: false, error: 'Earnings already processed' };
    }

    // Get rider details
    const rider = await User.findById(order.riderId);
    if (!rider) {
      console.error(`❌ [processRiderEarnings] Rider not found: ${order.riderId}`);
      return { success: false, error: 'Rider not found' };
    }

    // Calculate earnings
    const deliveryFee = order.deliveryFee || 0;
    const commission = Math.round(deliveryFee * 0.1 * 100) / 100; // 10% commission
    const netEarning = deliveryFee - commission;

    // Calculate distance (mock for now - would use actual location in production)
    const distance = Math.max(0.5, Math.random() * 10 + 1); // 1-10 km
    const deliveryTime = Math.max(10, Math.random() * 60 + 15); // 15-75 minutes

    // Create earning record
    const earning = new RiderEarning({
      riderId: order.riderId,
      orderId: order._id,
      restaurantId: order.restaurantId,
      deliveryFee,
      commission,
      incentive: 0, // Can be added later based on incentives
      penalty: 0, // Can be added later based on penalties
      totalEarning: netEarning,
      distance,
      deliveryTime,
      status: 'earned',
    });

    await earning.save();

    // Update rider wallet
    let wallet = await RiderWallet.findOne({ riderId: order.riderId });
    if (!wallet) {
      wallet = new RiderWallet({ riderId: order.riderId });
    }

    wallet.balance += netEarning;
    wallet.totalEarnings += netEarning;
    wallet.lastEarningDate = new Date();
    await wallet.save();

    /**
     * A completed delivery also releases a slice of the rider's bonus.
     *
     * Joining and referral money sits in the wallet unwithdrawable until it
     * has been ridden for; each delivery converts a fixed amount of it into
     * balance the rider can actually take out. Done after the earning is
     * saved so a failure here cannot cost them the delivery fee.
     */
    let bonusReleased = 0;
    try {
      const release = await releaseBonusForOrder({
        riderId: order.riderId,
        orderId: order._id,
      });
      bonusReleased = release.converted;
    } catch (bonusError) {
      console.error('[riderBonus] release failed:', bonusError?.message || bonusError);
    }

    // Update rider stats
    rider.completedTrips = (rider.completedTrips || 0) + 1;
    rider.totalEarnings = (rider.totalEarnings || 0) + netEarning;
    await rider.save();

    console.log(`✅ [processRiderEarnings] Successfully processed earnings for order ${orderId}:`, {
      riderId: order.riderId,
      deliveryFee,
      commission,
      netEarning,
      bonusReleased,
      newBalance: wallet.balance,
    });

    return {
      success: true,
      data: {
        earningId: earning._id,
        riderId: order.riderId,
        deliveryFee,
        commission,
        netEarning,
        newBalance: wallet.balance,
      },
    };
  } catch (error) {
    console.error(`❌ [processRiderEarnings] Error processing earnings for order ${orderId}:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Adjust rider earnings (for incentives or penalties)
 */
export const adjustRiderEarnings = async (earningId, adjustmentData) => {
  try {
    const { adjustmentType, amount, reason, adjustedBy } = adjustmentData;

    const earning = await RiderEarning.findById(earningId);
    if (!earning) {
      throw new Error('Earning record not found');
    }

    const originalAmount = earning.totalEarning;
    let adjustmentAmount = 0;

    switch (adjustmentType) {
      case 'incentive':
        adjustmentAmount = Math.abs(amount);
        earning.incentive += adjustmentAmount;
        earning.totalEarning += adjustmentAmount;
        break;
      case 'penalty':
        adjustmentAmount = -Math.abs(amount);
        earning.penalty += Math.abs(amount);
        earning.totalEarning = Math.max(0, earning.totalEarning - Math.abs(amount));
        break;
      case 'correction':
        adjustmentAmount = amount - originalAmount;
        earning.totalEarning = Math.max(0, amount);
        break;
      default:
        throw new Error('Invalid adjustment type');
    }

    // Update adjustment info
    earning.adjustmentInfo = {
      adjustedBy,
      adjustmentType,
      originalAmount,
      adjustmentAmount,
      reason,
      adjustedAt: new Date(),
    };

    earning.status = 'adjusted';
    await earning.save();

    // Update wallet balance
    if (adjustmentAmount !== 0) {
      const wallet = await RiderWallet.findOne({ riderId: earning.riderId });
      if (wallet) {
        wallet.balance += adjustmentAmount;
        wallet.totalEarnings += adjustmentAmount;
        await wallet.save();
      }
    }

    console.log(`✅ [adjustRiderEarnings] Adjusted earnings for ${earningId}:`, {
      adjustmentType,
      adjustmentAmount,
      newTotal: earning.totalEarning,
    });

    return {
      success: true,
      data: {
        earningId,
        adjustmentType,
        adjustmentAmount,
        newTotal: earning.totalEarning,
      },
    };
  } catch (error) {
    console.error(`❌ [adjustRiderEarnings] Error adjusting earnings:`, error);
    return { success: false, error: error.message };
  }
};

/**
 * Get rider earnings summary for a period
 */
export const getRiderEarningsSummary = async (riderId, startDate, endDate) => {
  try {
    const matchStage = {
      riderId: new mongoose.Types.ObjectId(riderId),
    };

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) {
        matchStage.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        matchStage.createdAt.$lte = new Date(endDate);
      }
    }

    const summary = await RiderEarning.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$totalEarning' },
          totalOrders: { $sum: 1 },
          totalDeliveryFees: { $sum: '$deliveryFee' },
          totalCommission: { $sum: '$commission' },
          totalIncentives: { $sum: '$incentive' },
          totalPenalties: { $sum: '$penalty' },
          avgEarningPerOrder: { $avg: '$totalEarning' },
          totalDistance: { $sum: '$distance' },
          avgDeliveryTime: { $avg: '$deliveryTime' },
        },
      },
    ]);

    return summary[0] || {
      totalEarnings: 0,
      totalOrders: 0,
      totalDeliveryFees: 0,
      totalCommission: 0,
      totalIncentives: 0,
      totalPenalties: 0,
      avgEarningPerOrder: 0,
      totalDistance: 0,
      avgDeliveryTime: 0,
    };
  } catch (error) {
    console.error(`❌ [getRiderEarningsSummary] Error:`, error);
    throw error;
  }
};

/**
 * Process referral rewards for riders
 */
export const processRiderReferralReward = async (riderId, referralType) => {
  try {
    let rewardAmount = 0;
    let reason = '';

    switch (referralType) {
      case 'rider_signup':
        rewardAmount = 100; // ₹100 for referring a new rider
        reason = 'Rider signup referral bonus';
        break;
      case 'vendor_signup':
        rewardAmount = 200; // ₹200 for referring a new vendor
        reason = 'Vendor signup referral bonus';
        break;
      case 'rider_first_order':
        rewardAmount = 50; // ₹50 when referred rider completes first order
        reason = 'Referred rider first order bonus';
        break;
      case 'vendor_first_order':
        rewardAmount = 150; // ₹150 when referred vendor gets first order
        reason = 'Referred vendor first order bonus';
        break;
      default:
        return { success: false, error: 'Invalid referral type' };
    }

    // Create earning record for referral
    const earning = new RiderEarning({
      riderId,
      orderId: null, // No order associated with referral
      restaurantId: null,
      deliveryFee: 0,
      commission: 0,
      incentive: rewardAmount,
      penalty: 0,
      totalEarning: rewardAmount,
      distance: 0,
      deliveryTime: 0,
      status: 'earned',
    });

    await earning.save();

    // Update rider wallet
    let wallet = await RiderWallet.findOne({ riderId });
    if (!wallet) {
      wallet = new RiderWallet({ riderId });
    }

    wallet.balance += rewardAmount;
    wallet.totalEarnings += rewardAmount;
    wallet.lastEarningDate = new Date();
    await wallet.save();

    console.log(`✅ [processRiderReferralReward] Processed referral reward for rider ${riderId}:`, {
      referralType,
      rewardAmount,
      reason,
      newBalance: wallet.balance,
    });

    return {
      success: true,
      data: {
        earningId: earning._id,
        riderId,
        referralType,
        rewardAmount,
        reason,
        newBalance: wallet.balance,
      },
    };
  } catch (error) {
    console.error(`❌ [processRiderReferralReward] Error:`, error);
    return { success: false, error: error.message };
  }
};

export default {
  processRiderEarnings,
  adjustRiderEarnings,
  getRiderEarningsSummary,
  processRiderReferralReward,
};
