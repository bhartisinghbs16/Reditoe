/**
 * Rider Earnings and Wallet Controller
 * Handles rider earnings calculation, wallet management, and withdrawals
 */
import Order, { deriveOrderNumberFromId } from '../models/Order.js';
import User from '../models/User.js';
import RiderWallet from '../models/RiderWallet.js';
import RiderEarning from '../models/RiderEarning.js';
import RiderWithdrawal from '../models/RiderWithdrawal.js';
import mongoose from 'mongoose';
import { createRiderWithdrawalRequest, getRiderBankDetailsView, updateRiderBankDetailsWithAutopay } from '../services/riderPayoutService.js';

const serializeRiderWithdrawal = (withdrawal) => ({
  id: withdrawal._id,
  // The reference a partner can quote to support. Without it the apps have
  // nothing to show but the Mongo id.
  withdrawalId: withdrawal.withdrawalId,
  amount: withdrawal.amount,
  status: withdrawal.status,
  createdAt: withdrawal.createdAt,
  processedAt: withdrawal.processedAt || null,
  transactionReference: withdrawal.transactionReference || null,
  rejectionReason: withdrawal.rejectionReason || null,
  bankDetails: {
    accountHolderName: withdrawal.bankDetails.accountHolderName,
    bankName: withdrawal.bankDetails.bankName,
    accountNumber: withdrawal.bankDetails.accountNumber.slice(-4),
    ifscCode: withdrawal.bankDetails.ifsc,
    ifsc: withdrawal.bankDetails.ifsc,
    branch: withdrawal.bankDetails.branch || '',
  },
});

/**
 * Get rider wallet information - GET /api/rider/wallet
 */
export const getRiderWallet = async (req, res) => {
  try {
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Find or create rider wallet
    let wallet = await RiderWallet.findOne({ riderId });
    if (!wallet) {
      wallet = new RiderWallet({ riderId });
      await wallet.save();
    }

    // Calculate today's earnings
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const RiderEarning = (await import('../models/RiderEarning.js')).default;
    const todayEarnings = await RiderEarning.aggregate([
      {
        $match: {
          riderId: wallet.riderId,
          createdAt: { $gte: todayStart },
          status: { $in: ['earned', 'adjusted'] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$totalEarning' },
        },
      },
    ]);

    const todayTotal = todayEarnings[0]?.total || 0;

    // Get recent transactions
    const RiderWithdrawal = (await import('../models/RiderWithdrawal.js')).default;
    const recentWithdrawals = await RiderWithdrawal.find({
      riderId: wallet.riderId,
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const pendingAmount = await RiderWithdrawal.aggregate([
      {
        $match: {
          riderId: wallet.riderId,
          status: { $in: ['pending', 'approved'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);

    const pendingTotal = pendingAmount[0]?.total || 0;

    return res.status(200).json({
      status: 'success',
      data: {
        currentBalance: wallet.balance,
        totalEarnings: wallet.totalEarnings,
        totalWithdrawals: wallet.totalWithdrawn,
        pendingWithdrawals: pendingTotal,
        todayEarnings: todayTotal,
        lastEarningDate: wallet.lastEarningDate,
        lastWithdrawDate: wallet.lastWithdrawDate,
        transactions: recentWithdrawals.map(w => ({
          id: w._id,
          amount: w.amount,
          status: w.status,
          createdAt: w.createdAt,
          transactionReference: w.transactionReference || null,
          rejectionReason: w.rejectionReason || null,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch wallet information',
    });
  }
};

/**
 * Get rider earnings history - GET /api/rider/earnings
 */
export const getRiderEarnings = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { period, startDate, endDate } = req.query;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Build date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        dateFilter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        dateFilter.createdAt.$lte = new Date(endDate);
      }
    } else if (period) {
      const now = new Date();
      switch (period) {
        case 'today':
          dateFilter.createdAt = {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
          };
          break;
        case 'week':
          dateFilter.createdAt = {
            $gte: new Date(now.setDate(now.getDate() - 7)),
          };
          break;
        case 'month':
          dateFilter.createdAt = {
            $gte: new Date(now.setMonth(now.getMonth() - 1)),
          };
          break;
        default:
          break;
      }
    }

    // Get earnings with pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [earnings, total] = await Promise.all([
      RiderEarning.find({ riderId, ...dateFilter })
        .populate('orderId', 'createdAt total orderNumber')
        .populate('restaurantId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      RiderEarning.countDocuments({ riderId, ...dateFilter }),
    ]);

    // Calculate summary
    const summary = await RiderEarning.aggregate([
      { $match: {
        riderId: new mongoose.Types.ObjectId(String(riderId)),
        ...dateFilter
      } },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$totalEarning' },
          totalOrders: { $sum: 1 },
          totalDeliveryFees: { $sum: '$deliveryFee' },
          totalIncentives: { $sum: '$incentive' },
          totalPenalties: { $sum: '$penalty' },
          avgEarningPerOrder: { $avg: '$totalEarning' },
        },
      },
    ]);

    const summaryData = summary[0] || {
      totalEarnings: 0,
      totalOrders: 0,
      totalDeliveryFees: 0,
      totalIncentives: 0,
      totalPenalties: 0,
      avgEarningPerOrder: 0,
    };

    res.status(200).json({
      status: 'success',
      data: {
        earnings: earnings.map(earning => ({
          id: earning._id,
          // orderId = raw MongoDB _id of the order (kept for system/navigation use)
          orderId: earning.orderId?._id?.toString() || null,
          // orderNumber = human-readable display label (e.g. AAA-682), same as shown in Order View
          orderNumber: earning.orderId?.orderNumber
            || (earning.orderId?._id ? deriveOrderNumberFromId(earning.orderId._id) : null),
          orderDate: earning.orderId?.createdAt || earning.createdAt,
          restaurantName: earning.restaurantId?.name || 'Unknown',
          deliveryFee: earning.deliveryFee,
          commission: earning.commission,
          incentive: earning.incentive,
          penalty: earning.penalty,
          totalEarning: earning.totalEarning,
          distance: earning.distance,
          deliveryTime: earning.deliveryTime,
          status: earning.status,
          adjustmentInfo: earning.adjustmentInfo,
        })),
        summary: {
          totalEarnings: Math.round(summaryData.totalEarnings * 100) / 100,
          totalOrders: summaryData.totalOrders,
          totalDeliveryFees: Math.round(summaryData.totalDeliveryFees * 100) / 100,
          totalIncentives: Math.round(summaryData.totalIncentives * 100) / 100,
          totalPenalties: Math.round(summaryData.totalPenalties * 100) / 100,
          avgEarningPerOrder: Math.round(summaryData.avgEarningPerOrder * 100) / 100,
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch earnings history',
    });
  }
};

/**
 * Get rider earnings analytics - GET /api/rider/analytics
 */
export const getRiderAnalytics = async (req, res) => {
  try {
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Get daily earnings for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const dailyEarnings = await RiderEarning.aggregate([
      {
        $match: {
          riderId: new mongoose.Types.ObjectId(riderId),
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          totalEarnings: { $sum: '$totalEarning' },
          orderCount: { $sum: 1 },
          avgEarningPerOrder: { $avg: '$totalEarning' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    // Format daily data for chart
    const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const dailyChartData = [];
    const today = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      
      const dayData = dailyEarnings.find(d => d._id === dateStr);
      dailyChartData.push({
        value: dayData ? Math.round(dayData.totalEarnings * 100) / 100 : 0,
        label: dayLabels[date.getDay() === 0 ? 6 : date.getDay() - 1],
        orderCount: dayData ? dayData.orderCount : 0,
      });
    }

    // Get weekly earnings for last 4 weeks
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    fourWeeksAgo.setHours(0, 0, 0, 0);

    const weeklyEarnings = await RiderEarning.aggregate([
      {
        $match: {
          riderId: new mongoose.Types.ObjectId(riderId),
          createdAt: { $gte: fourWeeksAgo },
        },
      },
      {
        $group: {
          _id: {
            $week: '$createdAt',
          },
          totalEarnings: { $sum: '$totalEarning' },
          orderCount: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const weeklyChartData = weeklyEarnings.slice(-4).map((week, index) => ({
      value: Math.round(week.totalEarnings * 100) / 100,
      label: `Week ${index + 1}`,
      orderCount: week.orderCount,
    }));

    // Get monthly earnings for last 4 months
    const fourMonthsAgo = new Date();
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);
    fourMonthsAgo.setDate(1);
    fourMonthsAgo.setHours(0, 0, 0, 0);

    const monthlyEarnings = await RiderEarning.aggregate([
      {
        $match: {
          riderId: new mongoose.Types.ObjectId(riderId),
          createdAt: { $gte: fourMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m', date: '$createdAt' },
          },
          totalEarnings: { $sum: '$totalEarning' },
          orderCount: { $sum: 1 },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);

    const monthlyChartData = monthlyEarnings.slice(-4).map((month, index) => {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthDate = new Date(month._id + '-01');
      return {
        value: Math.round(month.totalEarnings * 100) / 100,
        label: monthNames[monthDate.getMonth()],
        orderCount: month.orderCount,
      };
    });

    // Calculate summary stats for frontend
    const todayStr = new Date().toISOString().split('T')[0];
    const todayData = dailyEarnings.find(d => d._id === todayStr);
    const todayEarnings = todayData ? Math.round(todayData.totalEarnings * 100) / 100 : 0;
    
    const totalEarnings = dailyChartData.reduce((sum, d) => sum + d.value, 0) +
      weeklyChartData.reduce((sum, d) => sum + d.value, 0);
    const totalDeliveries = dailyChartData.reduce((sum, d) => sum + d.orderCount, 0);
    
    // Get rider profile for rating and online hours
    const rider = await User.findById(riderId);
    const avgRating = rider?.currentRating || 4.8;
    
    // Calculate online hours from onlineHistory if available
    let onlineHours = 0;
    if (rider?.onlineHistory && rider.onlineHistory.length > 0) {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayHistory = rider.onlineHistory.filter(h => new Date(h.timestamp) >= todayStart);
      // Rough calculation: count online entries * avg session time
      onlineHours = Math.round(todayHistory.length * 0.5 * 10) / 10;
    }
    
    // Calculate success rate from orders
    const allOrders = await Order.find({ riderId });
    const deliveredOrders = allOrders.filter(o => o.status === 'Delivered').length;
    const assignedOrders = allOrders.filter(o => o.status === 'OnWay' || o.status === 'Delivered').length;
    const successRate = assignedOrders > 0 ? Math.round((deliveredOrders / assignedOrders) * 100) : 95;

    res.status(200).json({
      status: 'success',
      data: {
        todayEarnings,
        totalEarnings: Math.round(totalEarnings * 100) / 100,
        totalDeliveries,
        avgRating: avgRating > 0 ? Math.round(avgRating * 10) / 10 : 4.8,
        successRate,
        onlineHours,
        dailyChartData,
        weeklyChartData,
        monthlyChartData,
      },
    });
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch analytics',
    });
  }
};

/**
 * Create withdrawal request - POST /api/rider/withdraw
 */
export const createWithdrawalRequest = async (req, res) => {
  try {
    const riderId = req.riderId;
    const { amount } = req.body;
    const result = await createRiderWithdrawalRequest({
      riderId,
      amount: Number(amount),
    });
    const { withdrawal, duplicate } = result;
    const wallet = await RiderWallet.findOne({ riderId });

    res.status(201).json({
      status: 'success',
      message: duplicate
        ? 'Existing withdrawal request reused (idempotent)'
        : 'Withdrawal request submitted successfully',
      data: {
        withdrawal: serializeRiderWithdrawal(withdrawal),
        remainingBalance: wallet?.balance ?? 0,
      },
    });
  } catch (error) {
    res.status(error?.statusCode || 500).json({
      status: 'error',
      message: error.message || 'Failed to create withdrawal request',
    });
  }
};
/**
 * Get withdrawal history - GET /api/rider/withdrawals
 */
export const getWithdrawalHistory = async (req, res) => {
  try {
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Get withdrawals with pagination
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [withdrawals, total] = await Promise.all([
      RiderWithdrawal.find({ riderId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      RiderWithdrawal.countDocuments({ riderId }),
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        withdrawals: withdrawals.map(serializeRiderWithdrawal),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch withdrawal history',
    });
  }
};

/**
 * Update rider bank details - PUT /api/rider/bank-details
 */
export const updateBankDetails = async (req, res) => {
  try {
    const riderId = req.riderId;
    const {
      accountHolderName,
      accountNumber,
      ifsc,
      bankName,
    } = req.body;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    if (!accountHolderName || !accountNumber || !ifsc || !bankName) {
      return res.status(400).json({
        status: 'error',
        message: 'Account holder name, account number, IFSC, and bank name are required',
      });
    }

    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(ifsc).toUpperCase())) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid IFSC code format',
      });
    }

    if (!/^\d{9,18}$/.test(String(accountNumber).replace(/\s/g, ''))) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid account number format',
      });
    }

    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    const data = await updateRiderBankDetailsWithAutopay(rider, {
      ...req.body,
      ifsc: String(ifsc).toUpperCase().trim(),
    });

    res.status(200).json({
      status: 'success',
      message: 'Bank details updated successfully',
      data,
    });
  } catch (error) {
    res.status(error?.statusCode || 500).json({
      status: 'error',
      message: error.message || 'Failed to update bank details',
    });
  }
};
/**
 * Get rider bank details - GET /api/rider/bank-details
 */
export const getBankDetails = async (req, res) => {
  try {
    const riderId = req.riderId;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const rider = await User.findById(riderId);
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: getRiderBankDetailsView(rider),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch bank details',
    });
  }
};
export default {
  getRiderWallet,
  getRiderEarnings,
  getRiderAnalytics,
  createWithdrawalRequest,
  getWithdrawalHistory,
  updateBankDetails,
  getBankDetails,
};



