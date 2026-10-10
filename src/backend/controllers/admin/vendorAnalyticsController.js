/**
 * Admin Vendor Analytics Controller
 */
import VendorAnalytics from '../../models/VendorAnalytics.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import Order from '../../models/Order.js';

// GET /api/admin/vendor-analytics - Get all vendors analytics
export const getVendorAnalytics = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      vendorId,
      performanceFlag,
      sortBy = 'overallStats.totalRevenue',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    
    if (vendorId) filter.vendorId = vendorId;

    // Performance flag filtering
    if (performanceFlag) {
      filter[`performanceFlags.${performanceFlag}`] = true;
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const analytics = await VendorAnalytics.find(filter)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name category rating')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await VendorAnalytics.countDocuments(filter);

    res.json({
      success: true,
      data: {
        analytics,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor analytics',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-analytics/summary - Get analytics summary
export const getAnalyticsSummary = async (req, res) => {
  try {
    const summary = await VendorAnalytics.aggregate([
      {
        $group: {
          _id: null,
          totalVendors: { $sum: 1 },
          totalOrders: { $sum: '$overallStats.totalOrders' },
          totalRevenue: { $sum: '$overallStats.totalRevenue' },
          averageRating: { $avg: '$overallStats.overallRating' },
          averageCompletionRate: { $avg: '$overallStats.completionRate' },
          averageCancellationRate: { $avg: '$overallStats.cancellationRate' },
          highPerformers: {
            $sum: { $cond: ['$performanceFlags.isHighPerformer', 1, 0] }
          },
          lowPerformers: {
            $sum: { $cond: ['$performanceFlags.isLowPerformer', 1, 0] }
          },
          totalCommission: { $sum: '$overallStats.totalCommission' },
          totalPlatformFee: { $sum: '$overallStats.totalPlatformFee' }
        }
      }
    ]);

    const performanceFlags = await VendorAnalytics.aggregate([
      {
        $group: {
          _id: null,
          hasHighCancellationRate: {
            $sum: { $cond: ['$performanceFlags.hasHighCancellationRate', 1, 0] }
          },
          hasLowRating: {
            $sum: { $cond: ['$performanceFlags.hasLowRating', 1, 0] }
          },
          hasLongPreparationTime: {
            $sum: { $cond: ['$performanceFlags.hasLongPreparationTime', 1, 0] }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        summary: summary[0] || {},
        performanceFlags: performanceFlags[0] || {}
      }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics summary',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-analytics/performance - Get performance metrics
export const getPerformanceMetrics = async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;

    const metrics = await VendorAnalytics.aggregate([
      {
        $group: {
          _id: null,
          avgOrderValue: { $avg: '$overallStats.averageOrderValue' },
          avgPreparationTime: { $avg: '$overallStats.averagePreparationTime' },
          avgCompletionRate: { $avg: '$overallStats.completionRate' },
          avgCancellationRate: { $avg: '$overallStats.cancellationRate' },
          totalRevenue: { $sum: '$overallStats.totalRevenue' },
          totalOrders: { $sum: '$overallStats.totalOrders' },
          avgRating: { $avg: '$overallStats.overallRating' }
        }
      }
    ]);

    // Get trend data
    const trends = await VendorAnalytics.aggregate([
      { $unwind: '$dailyMetrics' },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$dailyMetrics.date' } },
          totalOrders: { $sum: '$dailyMetrics.totalOrders' },
          totalRevenue: { $sum: '$dailyMetrics.grossRevenue' },
          avgRating: { $avg: '$dailyMetrics.customerRating' }
        }
      },
      { $sort: { '_id': 1 } },
      { $limit: 30 } // Last 30 days
    ]);

    res.json({
      success: true,
      data: {
        metrics: metrics[0] || {},
        trends
      }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance metrics',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-analytics/rankings - Get vendor rankings
export const getVendorRankings = async (req, res) => {
  try {
    const { metric = 'revenue', limit = 10 } = req.query;

    let sortField;
    switch (metric) {
      case 'revenue':
        sortField = 'overallStats.totalRevenue';
        break;
      case 'orders':
        sortField = 'overallStats.totalOrders';
        break;
      case 'rating':
        sortField = 'overallStats.overallRating';
        break;
      case 'completion':
        sortField = 'overallStats.completionRate';
        break;
      default:
        sortField = 'overallStats.totalRevenue';
    }

    const rankings = await VendorAnalytics.find({})
      .populate('vendorId', 'name email')
      .populate('restaurantId', 'name category')
      .sort({ [sortField]: -1 })
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        rankings,
        metric
      }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor rankings',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-analytics/trends - Get sales trends
export const getSalesTrends = async (req, res) => {
  try {
    const { period = 'weekly', vendorId } = req.query;

    const matchStage = vendorId ? { vendorId } : {};

    const trends = await VendorAnalytics.aggregate([
      { $match: matchStage },
      { $unwind: '$dailyMetrics' },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === 'daily' ? '%Y-%m-%d' : '%Y-%U',
              date: '$dailyMetrics.date'
            }
          },
          totalOrders: { $sum: '$dailyMetrics.totalOrders' },
          totalRevenue: { $sum: '$dailyMetrics.grossRevenue' },
          avgOrderValue: { $avg: '$dailyMetrics.averageOrderValue' },
          completionRate: {
            $avg: {
              $cond: [
                { $gt: ['$dailyMetrics.totalOrders', 0] },
                { $multiply: [{ $divide: ['$dailyMetrics.completedOrders', '$dailyMetrics.totalOrders'] }, 100] },
                0
              ]
            }
          }
        }
      },
      { $sort: { '_id': 1 } },
      { $limit: period === 'daily' ? 30 : 12 } // 30 days or 12 weeks
    ]);

    res.json({
      success: true,
      data: {
        trends,
        period
      }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch sales trends',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-analytics/:id - Get single vendor analytics
export const getVendorAnalyticsById = async (req, res) => {
  try {
    const { id } = req.params;

    const analytics = await VendorAnalytics.findOne({ vendorId: id })
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name category rating');

    if (!analytics) {
      return res.status(404).json({
        success: false,
        message: 'Vendor analytics not found'
      });
    }

    // Get recent trends
    const trends = analytics.getTrends ? analytics.getTrends(7) : {};

    res.json({
      success: true,
      data: {
        analytics,
        trends
      }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendor analytics',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-analytics/export - Export analytics data
export const exportAnalytics = async (req, res) => {
  try {
    const { format = 'json', vendorId } = req.query;

    const filter = vendorId ? { vendorId } : {};

    const analytics = await VendorAnalytics.find(filter)
      .populate('vendorId', 'name email')
      .populate('restaurantId', 'name category');

    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = [
        'Vendor Name',
        'Restaurant Name',
        'Category',
        'Total Orders',
        'Completed Orders',
        'Cancelled Orders',
        'Total Revenue',
        'Average Order Value',
        'Overall Rating',
        'Completion Rate',
        'Cancellation Rate',
        'Total Commission',
        'Is High Performer'
      ];

      const csvData = analytics.map(a => [
        a.vendorId?.name || 'N/A',
        a.restaurantId?.name || 'N/A',
        a.restaurantId?.category || 'N/A',
        a.overallStats.totalOrders,
        a.overallStats.completedOrders,
        a.overallStats.cancelledOrders,
        a.overallStats.totalRevenue.toFixed(2),
        a.overallStats.averageOrderValue.toFixed(2),
        a.overallStats.overallRating.toFixed(2),
        a.overallStats.completionRate.toFixed(1) + '%',
        a.overallStats.cancellationRate.toFixed(1) + '%',
        a.overallStats.totalCommission.toFixed(2),
        a.performanceFlags.isHighPerformer ? 'Yes' : 'No'
      ]);

      const csvContent = [csvHeaders, ...csvData].map(row => row.join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=vendor-analytics.csv');
      res.send(csvContent);
    } else {
      // Return JSON format
      res.json({
        success: true,
        data: { analytics }
      });
    }
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to export analytics',
      error: error.message
    });
  }
};
