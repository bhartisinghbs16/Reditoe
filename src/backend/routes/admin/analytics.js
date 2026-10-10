import express from 'express';
import UserAnalytics from '../../models/UserAnalytics.js';
import Refund from '../../models/Refund.js';
import ActivityLog from '../../models/ActivityLog.js';
import AdminCommunication from '../../models/AdminCommunication.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';

const router = express.Router();

// Get revenue analytics
router.get('/revenue', async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    const days = period === '7days' ? 7 : period === '30days' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const analytics = await UserAnalytics.find({
      date: { $gte: startDate }
    }).sort({ date: 1 });

    const currentPeriod = analytics.slice(-30);
    const previousPeriod = analytics.slice(-60, -30);

    const currentRevenue = currentPeriod.reduce((sum, a) => sum + (a.revenueMetrics?.totalRevenue || 0), 0);
    const previousRevenue = previousPeriod.reduce((sum, a) => sum + (a.revenueMetrics?.totalRevenue || 0), 0);
    
    const currentOrders = currentPeriod.reduce((sum, a) => sum + (a.userActivityMetrics?.ordersPlaced || 0), 0);
    const previousOrders = previousPeriod.reduce((sum, a) => sum + (a.userActivityMetrics?.ordersPlaced || 0), 0);

    const growth = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : 0;

    res.json({
      status: 'success',
      data: {
        currentPeriod: {
          revenue: currentRevenue,
          orders: currentOrders,
          averageOrderValue: currentOrders > 0 ? currentRevenue / currentOrders : 0,
          growth
        },
        previousPeriod: {
          revenue: previousRevenue,
          orders: previousOrders,
          averageOrderValue: previousOrders > 0 ? previousRevenue / previousOrders : 0
        },
        trend: {
          daily: analytics.map(a => ({
            date: a.date.toISOString().split('T')[0],
            revenue: a.revenueMetrics?.totalRevenue || 0,
            orders: a.userActivityMetrics?.ordersPlaced || 0
          }))
        },
        forecast: {
          nextMonth: currentRevenue * 1.1,
          nextQuarter: currentRevenue * 3.3,
          confidence: 75
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get order analytics
router.get('/orders', async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    const days = period === '7days' ? 7 : period === '30days' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [analytics, orders] = await Promise.all([
      UserAnalytics.find({ date: { $gte: startDate } }),
      Order.find({ createdAt: { $gte: startDate } })
    ]);

    const totalOrders = orders.length;
    const completedOrders = orders.filter(o => o.status === 'Delivered').length;
    const cancelledOrders = orders.filter(o => o.status === 'Cancelled').length;
    const pendingOrders = orders.filter(o => ['Waiting for Confirmation', 'Order Confirmed'].includes(o.status)).length;
    const outForDeliveryOrders = orders.filter(o => o.status === 'OnWay').length;

    const cancellationRate = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

    const statusBreakdown = [
      { status: 'Pending', count: pendingOrders, percentage: totalOrders > 0 ? (pendingOrders / totalOrders) * 100 : 0 },
      { status: 'Confirmed', count: completedOrders, percentage: totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0 },
      { status: 'Cancelled', count: cancelledOrders, percentage: totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0 },
      { status: 'Out for Delivery', count: outForDeliveryOrders, percentage: totalOrders > 0 ? (outForDeliveryOrders / totalOrders) * 100 : 0 }
    ];

    res.json({
      status: 'success',
      data: {
        totalOrders,
        completedOrders,
        cancelledOrders,
        pendingOrders,
        outForDeliveryOrders,
        averagePreparationTime: 15,
        averageDeliveryTime: 35,
        cancellationRate,
        cancellationReasons: [
          { reason: 'Customer request', count: Math.floor(cancelledOrders * 0.6), percentage: 60 },
          { reason: 'Restaurant error', count: Math.floor(cancelledOrders * 0.3), percentage: 30 },
          { reason: 'Delivery issue', count: Math.floor(cancelledOrders * 0.1), percentage: 10 }
        ],
        statusBreakdown
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get customer analytics
router.get('/customers', async (req, res) => {
  try {
    const { period = '30days' } = req.query;
    const days = period === '7days' ? 7 : period === '30days' ? 30 : 90;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [analytics, users] = await Promise.all([
      UserAnalytics.find({ date: { $gte: startDate } }),
      User.find({ createdAt: { $gte: startDate } })
    ]);

    const totalCustomers = await User.countDocuments({ role: 'user' });
    const newCustomers = users.length;
    const activeCustomers = analytics.reduce((sum, a) => sum + a.activeUsers, 0) / analytics.length;
    const repeatCustomers = Math.floor(activeCustomers * 0.4);

    const retentionRate = analytics.reduce((sum, a) => sum + a.userRetentionRate, 0) / analytics.length;
    const averageOrdersPerCustomer = analytics.reduce((sum, a) => sum + (a.userSegmentMetrics?.activeUsers?.averageOrders || 0), 0) / analytics.length;

    res.json({
      status: 'success',
      data: {
        totalCustomers,
        newCustomers: {
          currentMonth: newCustomers,
          previousMonth: Math.floor(newCustomers * 0.8),
          growth: 25
        },
        activeCustomers: Math.floor(activeCustomers),
        repeatCustomers,
        customerRetentionRate: retentionRate,
        averageOrdersPerCustomer,
        demographics: {
          byAge: [
            { ageGroup: '18-24', count: Math.floor(totalCustomers * 0.2), percentage: 20 },
            { ageGroup: '25-34', count: Math.floor(totalCustomers * 0.35), percentage: 35 },
            { ageGroup: '35-44', count: Math.floor(totalCustomers * 0.25), percentage: 25 },
            { ageGroup: '45+', count: Math.floor(totalCustomers * 0.2), percentage: 20 }
          ],
          byLocation: [
            { city: 'New York', count: Math.floor(totalCustomers * 0.3), percentage: 30 },
            { city: 'Los Angeles', count: Math.floor(totalCustomers * 0.2), percentage: 20 },
            { city: 'Chicago', count: Math.floor(totalCustomers * 0.15), percentage: 15 },
            { city: 'Houston', count: Math.floor(totalCustomers * 0.1), percentage: 10 },
            { city: 'Other', count: Math.floor(totalCustomers * 0.25), percentage: 25 }
          ]
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get restaurant analytics
router.get('/restaurants', async (req, res) => {
  try {
    const totalRestaurants = await User.countDocuments({ role: 'vendor' });
    const activeRestaurants = Math.floor(totalRestaurants * 0.8);
    const newRestaurants = Math.floor(totalRestaurants * 0.1);

    res.json({
      status: 'success',
      data: {
        totalRestaurants,
        activeRestaurants,
        newRestaurants,
        topPerformers: [
          {
            id: '1',
            name: 'Pizza Palace',
            revenue: 15000,
            orders: 450,
            rating: 4.5,
            growth: 12
          },
          {
            id: '2',
            name: 'Burger Junction',
            revenue: 12000,
            orders: 380,
            rating: 4.3,
            growth: 8
          }
        ],
        cuisineBreakdown: [
          { cuisine: 'Italian', count: Math.floor(totalRestaurants * 0.25), revenue: 45000, percentage: 25 },
          { cuisine: 'American', count: Math.floor(totalRestaurants * 0.3), revenue: 55000, percentage: 30 },
          { cuisine: 'Asian', count: Math.floor(totalRestaurants * 0.2), revenue: 35000, percentage: 20 },
          { cuisine: 'Mexican', count: Math.floor(totalRestaurants * 0.15), revenue: 28000, percentage: 15 },
          { cuisine: 'Other', count: Math.floor(totalRestaurants * 0.1), revenue: 18000, percentage: 10 }
        ],
        performanceMetrics: {
          averageRating: 4.2,
          averagePreparationTime: 18,
          averageOrderValue: 28
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get delivery analytics
router.get('/delivery', async (req, res) => {
  try {
    const totalDeliveries = await Order.countDocuments({ status: 'Delivered' });
    const successfulDeliveries = Math.floor(totalDeliveries * 0.95);
    const failedDeliveries = totalDeliveries - successfulDeliveries;

    res.json({
      status: 'success',
      data: {
        totalDeliveries,
        successfulDeliveries,
        failedDeliveries,
        averageDeliveryTime: 35,
        deliveryEfficiency: 95,
        riderPerformance: [
          {
            riderId: '1',
            name: 'John Rider',
            deliveries: 45,
            averageTime: 32,
            rating: 4.8,
            efficiency: 98
          },
          {
            riderId: '2',
            name: 'Sarah Rider',
            deliveries: 38,
            averageTime: 28,
            rating: 4.9,
            efficiency: 96
          }
        ],
        timeSlots: [
          { slot: 'Morning (6-12)', deliveries: Math.floor(totalDeliveries * 0.3), efficiency: 94 },
          { slot: 'Afternoon (12-18)', deliveries: Math.floor(totalDeliveries * 0.4), efficiency: 96 },
          { slot: 'Evening (18-24)', deliveries: Math.floor(totalDeliveries * 0.3), efficiency: 95 }
        ]
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

export default router;
