import express from 'express';
import UserAnalytics from '../models/UserAnalytics.js';
import { adminProtect } from '../middleware/adminAuth.js';

const router = express.Router();
router.use(adminProtect);

// Get user analytics with pagination
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 30;
    const skip = (page - 1) * limit;
    
    const { startDate, endDate } = req.query;

    let query = {};
    
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = new Date(startDate);
      }
      if (endDate) {
        query.date.$lte = new Date(endDate);
      }
    }

    const analytics = await UserAnalytics.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await UserAnalytics.countDocuments(query);

    res.json({
      status: 'success',
      data: analytics,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get latest analytics
router.get('/latest', async (req, res) => {
  try {
    const latest = await UserAnalytics.findOne()
      .sort({ date: -1 });

    res.json({
      status: 'success',
      data: latest
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get analytics for date range
router.get('/range', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        status: 'error',
        message: 'Start date and end date are required'
      });
    }

    const analytics = await UserAnalytics.find({
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }).sort({ date: 1 });

    res.json({
      status: 'success',
      data: analytics
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get analytics summary
router.get('/summary', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const summary = await UserAnalytics.aggregate([
      { $match: { date: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          avgTotalUsers: { $avg: '$totalUsers' },
          avgActiveUsers: { $avg: '$activeUsers' },
          avgNewUsers: { $avg: '$newUsers' },
          avgRetentionRate: { $avg: '$userRetentionRate' },
          avgSessionDuration: { $avg: '$averageSessionDuration' },
          avgEngagementScore: { $avg: '$userEngagementScore' },
          totalRevenue: { $sum: '$revenueMetrics.totalRevenue' },
          totalOrders: { $sum: '$userActivityMetrics.ordersPlaced' },
          totalLogins: { $sum: '$userActivityMetrics.logins' }
        }
      }
    ]);

    const deviceBreakdown = await UserAnalytics.aggregate([
      { $match: { date: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          avgMobilePercentage: { $avg: '$deviceBreakdown.mobile.percentage' },
          avgDesktopPercentage: { $avg: '$deviceBreakdown.desktop.percentage' },
          avgTabletPercentage: { $avg: '$deviceBreakdown.tablet.percentage' },
          avgApiPercentage: { $avg: '$deviceBreakdown.api.percentage' }
        }
      }
    ]);

    const trends = await UserAnalytics.find({
      date: { $gte: startDate }
    }).sort({ date: 1 }).select('date totalUsers activeUsers newUsers');

    res.json({
      status: 'success',
      data: {
        summary: summary[0] || {},
        deviceBreakdown: deviceBreakdown[0] || {},
        trends
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get user segment analytics
router.get('/segments', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const segments = await UserAnalytics.aggregate([
      { $match: { date: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          avgNewUsers: { $avg: '$userSegmentMetrics.newUsers.count' },
          avgActiveUsers: { $avg: '$userSegmentMetrics.activeUsers.count' },
          avgInactiveUsers: { $avg: '$userSegmentMetrics.inactiveUsers.count' },
          avgVipUsers: { $avg: '$userSegmentMetrics.vipUsers.count' },
          avgNewUserOrders: { $avg: '$userSegmentMetrics.newUsers.averageOrders' },
          avgActiveUserOrders: { $avg: '$userSegmentMetrics.activeUsers.averageOrders' },
          avgNewUserSpent: { $avg: '$userSegmentMetrics.newUsers.averageSpent' },
          avgActiveUserSpent: { $avg: '$userSegmentMetrics.activeUsers.averageSpent' }
        }
      }
    ]);

    res.json({
      status: 'success',
      data: segments[0] || {}
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get conversion metrics
router.get('/conversions', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const conversions = await UserAnalytics.aggregate([
      { $match: { date: { $gte: startDate } } },
      {
        $group: {
          _id: null,
          avgRegistrationToOrder: { $avg: '$conversionMetrics.registrationToOrder.percentage' },
          avgOrderToRepeat: { $avg: '$conversionMetrics.orderToRepeat.percentage' },
          avgUserToVIP: { $avg: '$conversionMetrics.userToVIP.percentage' },
          totalRegistrationToOrder: { $sum: '$conversionMetrics.registrationToOrder.count' },
          totalOrderToRepeat: { $sum: '$conversionMetrics.orderToRepeat.count' },
          totalUserToVIP: { $sum: '$conversionMetrics.userToVIP.count' }
        }
      }
    ]);

    res.json({
      status: 'success',
      data: conversions[0] || {}
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

export default router;
