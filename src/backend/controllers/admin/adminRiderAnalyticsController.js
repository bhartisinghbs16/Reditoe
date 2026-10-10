/**
 * Admin Rider Analytics Controller
 * Provides advanced rider performance analytics calculated from real data
 * Uses existing Order and User models, no mock data
 */

import mongoose from 'mongoose';
import User from '../../models/User.js';
import Order from '../../models/Order.js';

/**
 * GET /admin/riders/:id/analytics - Get analytics for a single rider
 */
export const getRiderAnalyticsById = async (req, res) => {
  try {
    const { id: riderId } = req.params;
    const { period = '30' } = req.query;
    if (!riderId || !mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({ status: 'error', message: 'Valid rider ID is required' });
    }
    let rider = await User.findOne({ _id: riderId, role: 'rider' }).lean();
    if (!rider) {
      const DeliveryBoy = (await import('../../models/DeliveryBoy.js')).default;
      rider = await DeliveryBoy.findById(riderId).lean();
    }
    if (!rider) {
      return res.status(404).json({ status: 'error', message: 'Rider not found' });
    }
    const daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
    const riderOrders = await Order.find({
      riderId: new mongoose.Types.ObjectId(riderId),
      createdAt: { $gte: daysAgo }
    }).lean();
    const totalTrips = riderOrders.length;
    const completedTrips = riderOrders.filter(o => o.status === 'Delivered').length;
    const cancelledTrips = riderOrders.filter(o => o.status === 'Cancelled').length;
    const totalEarnings = riderOrders
      .filter(o => o.status === 'Delivered')
      .reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
    const successRate = totalTrips > 0 ? (completedTrips / totalTrips) * 100 : 0;
    res.status(200).json({
      status: 'success',
      data: {
        totalTrips,
        completedTrips,
        cancelledTrips,
        totalEarnings: Math.round(totalEarnings),
        successRate: Math.round(successRate * 100) / 100
      }
    });
  } catch (error) {    res.status(500).json({ status: 'error', message: error.message || 'Failed to fetch rider analytics' });
  }
};

/**
 * GET /admin/riders/analytics/performance - Get rider performance analytics
 */
export const getRiderPerformanceAnalytics = async (req, res) => {
  try {    const { period = '30' } = req.query; // Default to last 30 days
    const daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
    
    // Get all riders
    const riders = await User.find({ role: 'rider' })
      .select('_id name riderId vehicleName currentRating isOnline kycStatus perKmCharge')
      .lean();    // Calculate performance metrics for each rider
    const riderAnalytics = [];
    
    for (const rider of riders) {
      // Get all orders for this rider in the period
      const riderOrders = await Order.find({
        riderId: rider._id,
        createdAt: { $gte: daysAgo }
      }).lean();
      
      // Calculate metrics
      const totalOrders = riderOrders.length;
      const deliveredOrders = riderOrders.filter(order => order.status === 'Delivered').length;
      const cancelledOrders = riderOrders.filter(order => order.status === 'Cancelled').length;
      const onWayOrders = riderOrders.filter(order => order.status === 'OnWay').length;
      
      // Calculate acceptance ratio (delivered + onWay) / total assigned orders
      const assignedOrders = deliveredOrders + cancelledOrders + onWayOrders;
      const acceptanceRatio = assignedOrders > 0 ? (deliveredOrders + onWayOrders) / assignedOrders : 0;
      
      // Calculate rejection ratio
      const rejectionRatio = assignedOrders > 0 ? cancelledOrders / assignedOrders : 0;
      
      // Calculate average delivery time for delivered orders
      let totalDeliveryTime = 0;
      let deliveryTimeCount = 0;
      
      for (const order of riderOrders) {
        if (order.status === 'Delivered' && order.timeline && order.timeline.length > 0) {
          const readyEntry = order.timeline.find(entry => entry.status === 'Ready');
          const deliveredEntry = order.timeline.find(entry => entry.status === 'Delivered');
          
          if (readyEntry && deliveredEntry && readyEntry.timestamp && deliveredEntry.timestamp) {
            const deliveryTime = (new Date(deliveredEntry.timestamp) - new Date(readyEntry.timestamp)) / (1000 * 60); // minutes
            totalDeliveryTime += deliveryTime;
            deliveryTimeCount++;
          }
        }
      }
      
      const avgDeliveryTime = deliveryTimeCount > 0 ? totalDeliveryTime / deliveryTimeCount : 0;
      
      // Calculate earnings
      const totalEarnings = riderOrders
        .filter(order => order.status === 'Delivered')
        .reduce((sum, order) => sum + (order.deliveryFee || 0), 0);
      
      // Calculate incentives and penalties
      const incentives = rider.incentives || [];
      const penalties = rider.penalties || [];
      
      const periodIncentives = incentives.filter(inc => 
        new Date(inc.createdAt) >= daysAgo
      ).reduce((sum, inc) => sum + inc.amount, 0);
      
      const periodPenalties = penalties.filter(pen => 
        new Date(pen.createdAt) >= daysAgo
      ).reduce((sum, pen) => sum + pen.amount, 0);
      
      const netEarnings = totalEarnings + periodIncentives - periodPenalties;
      
      riderAnalytics.push({
        riderId: rider._id,
        name: rider.name,
        riderIdNumber: rider.riderId,
        vehicleName: rider.vehicleName,
        currentRating: rider.currentRating,
        isOnline: rider.isOnline,
        kycStatus: rider.kycStatus,
        perKmCharge: rider.perKmCharge,
        metrics: {
          totalOrders,
          deliveredOrders,
          cancelledOrders,
          onWayOrders,
          acceptanceRatio: Math.round(acceptanceRatio * 100) / 100,
          rejectionRatio: Math.round(rejectionRatio * 100) / 100,
          avgDeliveryTime: Math.round(avgDeliveryTime),
          totalEarnings: Math.round(totalEarnings),
          periodIncentives: Math.round(periodIncentives),
          periodPenalties: Math.round(periodPenalties),
          netEarnings: Math.round(netEarnings)
        }
      });
    }
    
    // Sort by net earnings (highest first)
    riderAnalytics.sort((a, b) => b.metrics.netEarnings - a.metrics.netEarnings);
    
    // Calculate overall statistics
    const totalRiders = riderAnalytics.length;
    const onlineRiders = riderAnalytics.filter(r => r.isOnline).length;
    const totalOrdersAll = riderAnalytics.reduce((sum, r) => sum + r.metrics.totalOrders, 0);
    const totalDeliveredAll = riderAnalytics.reduce((sum, r) => sum + r.metrics.deliveredOrders, 0);
    const totalCancelledAll = riderAnalytics.reduce((sum, r) => sum + r.metrics.cancelledOrders, 0);
    
    const overallAcceptanceRatio = totalOrdersAll > 0 ? (totalDeliveredAll + (totalOrdersAll - totalDeliveredAll - totalCancelledAll)) / totalOrdersAll : 0;
    const overallRejectionRatio = totalOrdersAll > 0 ? totalCancelledAll / totalOrdersAll : 0;
    
    const avgDeliveryTimeAll = riderAnalytics
      .filter(r => r.metrics.avgDeliveryTime > 0)
      .reduce((sum, r) => sum + r.metrics.avgDeliveryTime, 0) / 
      riderAnalytics.filter(r => r.metrics.avgDeliveryTime > 0).length || 0;
    
    const totalEarningsAll = riderAnalytics.reduce((sum, r) => sum + r.metrics.totalEarnings, 0);    res.status(200).json({
      status: 'success',
      data: {
        summary: {
          totalRiders,
          onlineRiders,
          totalOrders: totalOrdersAll,
          totalDelivered: totalDeliveredAll,
          totalCancelled: totalCancelledAll,
          overallAcceptanceRatio: Math.round(overallAcceptanceRatio * 100) / 100,
          overallRejectionRatio: Math.round(overallRejectionRatio * 100) / 100,
          avgDeliveryTime: Math.round(avgDeliveryTimeAll),
          totalEarnings: Math.round(totalEarningsAll),
          periodDays: parseInt(period)
        },
        riders: riderAnalytics
      }
    });
    
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to calculate rider performance analytics'
    });
  }
};

/**
 * GET /admin/riders/analytics/leaderboard - Get rider performance leaderboard
 */
export const getRiderLeaderboard = async (req, res) => {
  try {    const { period = '30', metric = 'netEarnings' } = req.query;
    const daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);
    
    // Get all riders
    const riders = await User.find({ role: 'rider', isBlocked: false })
      .select('_id name riderId vehicleName currentRating isOnline')
      .lean();
    
    const leaderboardData = [];
    
    for (const rider of riders) {
      // Get orders for this rider
      const riderOrders = await Order.find({
        riderId: rider._id,
        createdAt: { $gte: daysAgo }
      }).lean();
      
      // Calculate metrics
      const deliveredOrders = riderOrders.filter(order => order.status === 'Delivered').length;
      const totalOrders = riderOrders.length;
      
      const totalEarnings = riderOrders
        .filter(order => order.status === 'Delivered')
        .reduce((sum, order) => sum + (order.deliveryFee || 0), 0);
      
      // Calculate incentives and penalties
      const incentives = rider.incentives || [];
      const penalties = rider.penalties || [];
      
      const periodIncentives = incentives.filter(inc => 
        new Date(inc.createdAt) >= daysAgo
      ).reduce((sum, inc) => sum + inc.amount, 0);
      
      const periodPenalties = penalties.filter(pen => 
        new Date(pen.createdAt) >= daysAgo
      ).reduce((sum, pen) => sum + pen.amount, 0);
      
      const netEarnings = totalEarnings + periodIncentives - periodPenalties;
      
      // Calculate average delivery time
      let totalDeliveryTime = 0;
      let deliveryTimeCount = 0;
      
      for (const order of riderOrders) {
        if (order.status === 'Delivered' && order.timeline && order.timeline.length > 0) {
          const readyEntry = order.timeline.find(entry => entry.status === 'Ready');
          const deliveredEntry = order.timeline.find(entry => entry.status === 'Delivered');
          
          if (readyEntry && deliveredEntry) {
            const deliveryTime = (new Date(deliveredEntry.timestamp) - new Date(readyEntry.timestamp)) / (1000 * 60);
            totalDeliveryTime += deliveryTime;
            deliveryTimeCount++;
          }
        }
      }
      
      const avgDeliveryTime = deliveryTimeCount > 0 ? totalDeliveryTime / deliveryTimeCount : 0;
      
      leaderboardData.push({
        riderId: rider._id,
        name: rider.name,
        riderIdNumber: rider.riderId,
        vehicleName: rider.vehicleName,
        currentRating: rider.currentRating,
        isOnline: rider.isOnline,
        deliveredOrders,
        totalOrders,
        totalEarnings,
        periodIncentives,
        periodPenalties,
        netEarnings,
        avgDeliveryTime: Math.round(avgDeliveryTime)
      });
    }
    
    // Sort based on the requested metric
    switch (metric) {
      case 'deliveries':
        leaderboardData.sort((a, b) => b.deliveredOrders - a.deliveredOrders);
        break;
      case 'rating':
        leaderboardData.sort((a, b) => b.currentRating - a.currentRating);
        break;
      case 'speed':
        leaderboardData.sort((a, b) => {
          if (a.avgDeliveryTime === 0) return 1;
          if (b.avgDeliveryTime === 0) return -1;
          return a.avgDeliveryTime - b.avgDeliveryTime;
        });
        break;
      case 'netEarnings':
      default:
        leaderboardData.sort((a, b) => b.netEarnings - a.netEarnings);
        break;
    }
    
    // Add rankings
    leaderboardData.forEach((rider, index) => {
      rider.rank = index + 1;
    });    res.status(200).json({
      status: 'success',
      data: {
        leaderboard: leaderboardData.slice(0, 50), // Top 50
        metric,
        periodDays: parseInt(period),
        totalRiders: leaderboardData.length
      }
    });
    
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to generate rider leaderboard'
    });
  }
};

/**
 * GET /admin/riders/analytics/trends - Get rider performance trends over time
 */
export const getRiderTrends = async (req, res) => {
  try {    const { period = '30' } = req.query;
    const days = parseInt(period);
    const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Generate daily trend data
    const dailyTrends = [];
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      // Get orders for this day
      const dayOrders = await Order.find({
        createdAt: { $gte: date, $lt: nextDate },
        riderId: { $exists: true, $ne: null }
      }).lean();
      
      const totalOrders = dayOrders.length;
      const deliveredOrders = dayOrders.filter(order => order.status === 'Delivered').length;
      const cancelledOrders = dayOrders.filter(order => order.status === 'Cancelled').length;
      
      const totalEarnings = dayOrders
        .filter(order => order.status === 'Delivered')
        .reduce((sum, order) => sum + (order.deliveryFee || 0), 0);
      
      // Get unique riders who were active this day
      const activeRiders = new Set(dayOrders.map(order => order.riderId.toString())).size;
      
      dailyTrends.push({
        date: date.toISOString().split('T')[0],
        totalOrders,
        deliveredOrders,
        cancelledOrders,
        totalEarnings: Math.round(totalEarnings),
        activeRiders,
        acceptanceRate: totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0
      });
    }
    
    // Calculate weekly trends
    const weeklyTrends = [];
    const weeks = Math.ceil(days / 7);
    
    for (let i = weeks - 1; i >= 0; i--) {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
      weekStart.setHours(0, 0, 0, 0);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      const weekOrders = await Order.find({
        createdAt: { $gte: weekStart, $lt: weekEnd },
        riderId: { $exists: true, $ne: null }
      }).lean();
      
      const totalOrders = weekOrders.length;
      const deliveredOrders = weekOrders.filter(order => order.status === 'Delivered').length;
      const cancelledOrders = weekOrders.filter(order => order.status === 'Cancelled').length;
      
      const totalEarnings = weekOrders
        .filter(order => order.status === 'Delivered')
        .reduce((sum, order) => sum + (order.deliveryFee || 0), 0);
      
      const activeRiders = new Set(weekOrders.map(order => order.riderId.toString())).size;
      
      weeklyTrends.push({
        week: `Week ${weeks - i}`,
        startDate: weekStart.toISOString().split('T')[0],
        endDate: weekEnd.toISOString().split('T')[0],
        totalOrders,
        deliveredOrders,
        cancelledOrders,
        totalEarnings: Math.round(totalEarnings),
        activeRiders,
        acceptanceRate: totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0
      });
    }    res.status(200).json({
      status: 'success',
      data: {
        periodDays: days,
        dailyTrends,
        weeklyTrends
      }
    });
    
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to calculate rider trends'
    });
  }
};

/**
 * GET /admin/riders/analytics/summary - Get overall rider analytics summary
 */
export const getRiderAnalyticsSummary = async (req, res) => {
  try {    // Get basic rider stats
    const totalRiders = await User.countDocuments({ role: 'rider' });
    const onlineRiders = await User.countDocuments({ role: 'rider', isOnline: true, isBlocked: false });
    const blockedRiders = await User.countDocuments({ role: 'rider', isBlocked: true });
    const approvedRiders = await User.countDocuments({ role: 'rider', kycStatus: 'approved' });
    
    // Get order stats for different periods
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today.getTime() - today.getDay() * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const [todayOrders, weekOrders, monthOrders] = await Promise.all([
      Order.find({ createdAt: { $gte: today }, riderId: { $exists: true } }).lean(),
      Order.find({ createdAt: { $gte: thisWeek }, riderId: { $exists: true } }).lean(),
      Order.find({ createdAt: { $gte: thisMonth }, riderId: { $exists: true } }).lean()
    ]);
    
    // Calculate metrics for each period
    const calculatePeriodMetrics = (orders) => {
      const total = orders.length;
      const delivered = orders.filter(o => o.status === 'Delivered').length;
      const cancelled = orders.filter(o => o.status === 'Cancelled').length;
      const earnings = orders.filter(o => o.status === 'Delivered').reduce((sum, o) => sum + (o.deliveryFee || 0), 0);
      const activeRiders = new Set(orders.map(o => o.riderId.toString())).size;
      
      return {
        totalOrders: total,
        deliveredOrders: delivered,
        cancelledOrders: cancelled,
        totalEarnings: Math.round(earnings),
        activeRiders,
        acceptanceRate: total > 0 ? Math.round((delivered / total) * 100) : 0
      };
    };
    
    const todayMetrics = calculatePeriodMetrics(todayOrders);
    const weekMetrics = calculatePeriodMetrics(weekOrders);
    const monthMetrics = calculatePeriodMetrics(monthOrders);
    
    // Get top performers
    const topEarnersPipeline = [
      { $match: { riderId: { $exists: true }, status: 'Delivered', createdAt: { $gte: thisMonth } } },
      { $group: { _id: '$riderId', earnings: { $sum: '$deliveryFee' }, deliveries: { $sum: 1 } } },
      { $sort: { earnings: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'rider' } },
      { $unwind: '$rider' },
      { $project: { name: '$rider.name', riderId: '$rider.riderId', earnings: 1, deliveries: 1 } }
    ];
    
    const topEarners = await Order.aggregate(topEarnersPipeline);    res.status(200).json({
      status: 'success',
      data: {
        riderStats: {
          total: totalRiders,
          online: onlineRiders,
          blocked: blockedRiders,
          approved: approvedRiders
        },
        performance: {
          today: todayMetrics,
          thisWeek: weekMetrics,
          thisMonth: monthMetrics
        },
        topEarners,
        lastUpdated: new Date()
      }
    });
    
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to generate rider analytics summary'
    });
  }
};
