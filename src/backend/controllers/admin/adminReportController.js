/**
 * Admin report controller. Aggregates from Order, Restaurant, User.
 * No new collections; read-only aggregations.
 */
import Order from '../../models/Order.js';
import Restaurant from '../../models/Restaurant.js';
import User from '../../models/User.js';
import FinancialTransaction from '../../models/FinancialTransaction.js';

function buildOrderDateFilter(fromDate, toDate) {
  const dateFilter = {};
  if (fromDate) {
    const from = new Date(fromDate);
    if (!isNaN(from.getTime())) dateFilter.$gte = from;
  }
  if (toDate) {
    const to = new Date(toDate);
    if (!isNaN(to.getTime())) dateFilter.$lte = to;
  }
  return Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
}

/**
 * GET /admin/reports - Aggregated stats for dashboard (optional single-call alternative).
 * Query: fromDate, toDate (optional date range).
 */
export const getReports = async (req, res) => {
  try {
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;

    const orderDateFilter = buildOrderDateFilter(fromDate, toDate);

    const [
      totalOrders,
      totalRestaurants,
      totalUsers,
      deliveredOrders,
      cancelledCount,
    ] = await Promise.all([
      Order.countDocuments(orderDateFilter),
      Restaurant.countDocuments({}),
      User.countDocuments({}),
      Order.find({ ...orderDateFilter, status: 'Delivered' }).select('total').lean(),
      Order.countDocuments({ ...orderDateFilter, status: 'Cancelled' }),
    ]);

    const totalRevenue = Array.isArray(deliveredOrders)
      ? deliveredOrders.reduce((s, o) => s + (Number(o.total) || 0), 0)
      : 0;

    res.status(200).json({
      status: 'success',
      data: {
        totalOrders,
        activeVendors: totalRestaurants,
        totalRevenue,
        newRegistrations: totalUsers,
        cancelledOrders: cancelledCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch reports',
    });
  }
};

/**
 * GET /admin/reports/restaurant-performance - Restaurant performance analytics
 * Query: fromDate, toDate (optional date range).
 * Returns per-restaurant metrics + daily revenue series + top rankings.
 */
export const getRestaurantPerformance = async (req, res) => {
  try {
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;
    const orderDateFilter = buildOrderDateFilter(fromDate, toDate);

    const restaurantMetricsPipeline = [
      { $match: { ...orderDateFilter } },
      {
        $group: {
          _id: '$restaurantId',
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0],
            },
          },
          cancelledOrders: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0],
            },
          },
          totalRevenue: {
            $sum: {
              $cond: [{ $eq: ['$status', 'Delivered'] }, '$total', 0],
            },
          },
        },
      },
      {
        $addFields: {
          averageOrderValue: {
            $cond: [
              { $gt: ['$completedOrders', 0] },
              { $divide: ['$totalRevenue', '$completedOrders'] },
              0,
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'restaurants',
          localField: '_id',
          foreignField: '_id',
          as: 'restaurant',
        },
      },
      {
        $unwind: {
          path: '$restaurant',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 0,
          restaurantId: '$_id',
          restaurantName: { $ifNull: ['$restaurant.name', 'Unknown'] },
          logo: {
            $cond: {
              if: { $and: [{ $ne: ['$restaurant.image', null] }, { $ne: ['$restaurant.image', ''] }] },
              then: {
                $cond: {
                  if: { $eq: [{ $indexOfCP: ['$restaurant.image', 'uploads/'] }, 0] },
                  then: '$restaurant.image',
                  else: { $concat: ['uploads/restaurants/', { $toString: '$_id' }, '/', '$restaurant.image'] },
                },
              },
              else: null,
            },
          },
          totalOrders: 1,
          completedOrders: 1,
          cancelledOrders: 1,
          totalRevenue: 1,
          averageOrderValue: 1,
        },
      },
      { $sort: { totalRevenue: -1 } },
    ];

    const revenueOverTimePipeline = [
      { $match: { ...orderDateFilter, status: 'Delivered' } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$createdAt',
            },
          },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: '$_id',
          revenue: 1,
          orders: 1,
        },
      },
    ];

    const [restaurants, revenueOverTime] = await Promise.all([
      Order.aggregate(restaurantMetricsPipeline),
      Order.aggregate(revenueOverTimePipeline),
    ]);

    const list = Array.isArray(restaurants) ? restaurants : [];
    const topByRevenue = [...list]
      .sort((a, b) => (Number(b.totalRevenue) || 0) - (Number(a.totalRevenue) || 0))
      .slice(0, 5);
    const topByOrders = [...list]
      .sort((a, b) => (Number(b.totalOrders) || 0) - (Number(a.totalOrders) || 0))
      .slice(0, 5);

    return res.status(200).json({
      status: 'success',
      data: {
        restaurants: list,
        revenueOverTime: Array.isArray(revenueOverTime) ? revenueOverTime : [],
        topByRevenue,
        topByOrders,
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch restaurant performance',
    });
  }
};

/**
 * GET /api/admin/reports/profit-dashboard
 * Advanced profit analytics with admin vs vendor breakdown
 */
export const getProfitDashboard = async (req, res) => {
  try {
    const { fromDate, toDate, restaurantId, groupBy = 'day' } = req.query;
    
    const dateFilter = buildOrderDateFilter(fromDate, toDate);
    const filter = { ...dateFilter, status: 'Delivered' };
    
    if (restaurantId) {
      filter.restaurantId = restaurantId;
    }

    // Revenue and commission trends
    const revenueTrends = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: groupBy === 'day' 
            ? { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            : groupBy === 'week'
            ? { $dateToString: { format: '%Y-%U', date: '$createdAt' } }
            : { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          totalRevenue: { $sum: '$total' },
          orderCount: { $sum: 1 },
          gstCollected: { $sum: '$gstAndPackaging' },
          platformFees: { $sum: '$platformFee' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    // Vendor-wise profit breakdown
    const vendorProfitBreakdown = await Order.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'restaurants',
          localField: 'restaurantId',
          foreignField: '_id',
          as: 'restaurant',
        },
      },
      { $unwind: '$restaurant' },
      {
        $group: {
          _id: '$restaurantId',
          restaurantName: { $first: '$restaurant.name' },
          totalRevenue: { $sum: '$total' },
          orderCount: { $sum: 1 },
          commissionPercent: { $first: '$restaurant.commissionPercent' },
        },
      },
      {
        $addFields: {
          commissionAmount: { $multiply: ['$totalRevenue', { $divide: ['$commissionPercent', 100] }] },
          vendorAmount: { $subtract: ['$totalRevenue', { $multiply: ['$totalRevenue', { $divide: ['$commissionPercent', 100] }] }] },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    // Calculate totals
    const totals = revenueTrends.reduce((acc, item) => {
      acc.totalRevenue += item.totalRevenue;
      acc.orderCount += item.orderCount;
      acc.gstCollected += item.gstCollected;
      acc.platformFees += item.platformFees;
      return acc;
    }, { totalRevenue: 0, orderCount: 0, gstCollected: 0, platformFees: 0 });

    const totalCommission = vendorProfitBreakdown.reduce((acc, item) => acc + item.commissionAmount, 0);
    const totalVendorRevenue = vendorProfitBreakdown.reduce((acc, item) => acc + item.vendorAmount, 0);

    res.status(200).json({
      status: 'success',
      data: {
        summary: {
          totalRevenue: totals.totalRevenue,
          totalCommission,
          totalVendorRevenue,
          totalOrders: totals.orderCount,
          totalGST: totals.gstCollected,
          totalPlatformFees: totals.platformFees,
          avgOrderValue: totals.orderCount > 0 ? totals.totalRevenue / totals.orderCount : 0,
        },
        revenueTrends,
        vendorProfitBreakdown,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch profit dashboard',
    });
  }
};

/**
 * GET /api/admin/reports/peak-time
 * Peak time analysis for orders
 */
export const getPeakTimeAnalysis = async (req, res) => {
  try {
    const { fromDate, toDate, restaurantId } = req.query;
    
    const dateFilter = buildOrderDateFilter(fromDate, toDate);
    const filter = { ...dateFilter, status: 'Delivered' };
    
    if (restaurantId) {
      filter.restaurantId = restaurantId;
    }

    // Hourly order distribution
    const hourlyDistribution = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    // Daily order distribution (day of week)
    const dailyDistribution = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    // Monthly trends
    const monthlyTrends = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          avgOrderValue: { $avg: '$total' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    // Peak hours identification - normalize shape for frontend
    const peakHours = hourlyDistribution
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 3)
      .map((item) => ({
        hour: item._id,
        orders: item.orderCount,
        revenue: item.totalRevenue || 0,
        averageOrderValue: item.orderCount > 0 ? Math.round((item.totalRevenue || 0) / item.orderCount) : 0,
      }));

    // Peak days identification
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const peakDays = dailyDistribution
      .map(item => ({ ...item, dayName: dayNames[item._id - 1] || 'Unknown' }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 3);

    res.status(200).json({
      status: 'success',
      data: {
        hourlyDistribution,
        dailyDistribution: dailyDistribution.map(item => ({
          ...item,
          dayName: dayNames[item._id - 1] || 'Unknown',
        })),
        monthlyTrends,
        peakHours,
        peakDays,
        insights: {
          busiestHour: peakHours[0]?.hour ?? 0,
          busiestDay: peakDays[0]?.dayName || 'Unknown',
          totalOrders: hourlyDistribution.reduce((sum, item) => sum + item.orderCount, 0),
          avgOrdersPerHour: hourlyDistribution.length > 0 
            ? hourlyDistribution.reduce((sum, item) => sum + item.orderCount, 0) / 24 
            : 0,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch peak time analysis',
    });
  }
};

/**
 * GET /api/admin/reports/heatmap
 * Heatmap data for order density and vendor locations
 */
export const getHeatmapData = async (req, res) => {
  try {
    const { fromDate, toDate, heatmapType = 'orders' } = req.query;
    
    const dateFilter = buildOrderDateFilter(fromDate, toDate);
    const filter = { ...dateFilter, status: 'Delivered' };

    let data;

    if (heatmapType === 'orders') {
      // Order density heatmap
      data = await Order.aggregate([
        { $match: { ...filter, 'deliveryAddress.coordinates': { $exists: true } } },
        {
          $group: {
            _id: {
              lat: { $round: ['$deliveryAddress.coordinates.latitude', 4] },
              lng: { $round: ['$deliveryAddress.coordinates.longitude', 4] },
            },
            orderCount: { $sum: 1 },
            totalRevenue: { $sum: '$total' },
          },
        },
        { $match: { orderCount: { $gte: 1 } } },
        { $sort: { orderCount: -1 } },
        { $limit: 1000 }, // Limit for performance
      ]);
    } else if (heatmapType === 'vendors') {
      // Vendor location heatmap
      data = await Restaurant.aggregate([
        { $match: { 'address.coordinates': { $exists: true }, isEnabled: true } },
        {
          $lookup: {
            from: 'orders',
            let: { restaurantId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$restaurantId', '$$restaurantId'] }, ...filter } },
              { $group: { _id: null, orderCount: { $sum: 1 }, totalRevenue: { $sum: '$total' } } },
            ],
            as: 'orderStats',
          },
        },
        { $unwind: { path: '$orderStats', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: {
              lat: { $round: ['$address.coordinates.latitude', 4] },
              lng: { $round: ['$address.coordinates.longitude', 4] },
            },
            restaurantName: '$name',
            orderCount: { $ifNull: ['$orderStats.orderCount', 0] },
            totalRevenue: { $ifNull: ['$orderStats.totalRevenue', 0] },
          },
        },
        { $match: { orderCount: { $gte: 0 } } },
        { $sort: { orderCount: -1 } },
      ]);
    }

    // Time-based heatmap (hour vs day of week)
    const timeHeatmap = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            hour: { $hour: '$createdAt' },
            dayOfWeek: { $dayOfWeek: '$createdAt' },
          },
          orderCount: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
        },
      },
      { $sort: { '_id.dayOfWeek': 1, '_id.hour': 1 } },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        heatmapData: data || [],
        timeHeatmap,
        metadata: {
          type: heatmapType,
          totalPoints: data?.length || 0,
          dateRange: { fromDate, toDate },
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch heatmap data',
    });
  }
};

/**
 * GET /api/admin/reports/export
 * Export reports in CSV/Excel format
 */
export const getExportData = async (req, res) => {
  try {
    const { 
      fromDate, 
      toDate, 
      restaurantId, 
      reportType = 'vendor-revenue',
      format = 'csv' 
    } = req.query;
    
    const dateFilter = buildOrderDateFilter(fromDate, toDate);
    const filter = { ...dateFilter, status: 'Delivered' };
    
    if (restaurantId) {
      filter.restaurantId = restaurantId;
    }

    let data;
    let filename;
    let headers;

    switch (reportType) {
      case 'vendor-revenue':
        data = await Order.aggregate([
          { $match: filter },
          {
            $lookup: {
              from: 'restaurants',
              localField: 'restaurantId',
              foreignField: '_id',
              as: 'restaurant',
            },
          },
          { $unwind: '$restaurant' },
          {
            $group: {
              _id: '$restaurantId',
              restaurantName: { $first: '$restaurant.name' },
              totalOrders: { $sum: 1 },
              totalRevenue: { $sum: '$total' },
              commissionPercent: { $first: '$restaurant.commissionPercent' },
              avgOrderValue: { $avg: '$total' },
            },
          },
          {
            $addFields: {
              commissionAmount: { $multiply: ['$totalRevenue', { $divide: ['$commissionPercent', 100] }] },
              vendorAmount: { $subtract: ['$totalRevenue', { $multiply: ['$totalRevenue', { $divide: ['$commissionPercent', 100] }] }] },
            },
          },
          { $sort: { totalRevenue: -1 } },
        ]);
        filename = `vendor-revenue-${fromDate || 'all'}-${toDate || 'all'}`;
        headers = ['Restaurant Name', 'Total Orders', 'Total Revenue', 'Commission %', 'Commission Amount', 'Vendor Amount', 'Avg Order Value'];
        break;

      case 'order-counts':
        data = await Order.aggregate([
          { $match: filter },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              orderCount: { $sum: 1 },
              totalRevenue: { $sum: '$total' },
              completedOrders: {
                $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] },
              },
              cancelledOrders: {
                $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] },
              },
            },
          },
          { $sort: { '_id': 1 } },
        ]);
        filename = `order-counts-${fromDate || 'all'}-${toDate || 'all'}`;
        headers = ['Date', 'Total Orders', 'Completed Orders', 'Cancelled Orders', 'Total Revenue'];
        break;

      case 'peak-time':
        const hourlyData = await Order.aggregate([
          { $match: filter },
          {
            $group: {
              _id: { $hour: '$createdAt' },
              orderCount: { $sum: 1 },
              totalRevenue: { $sum: '$total' },
              avgOrderValue: { $avg: '$total' },
            },
          },
          { $sort: { '_id': 1 } },
        ]);
        
        data = hourlyData.map(item => ({
          hour: `${item._id}:00`,
          ...item,
        }));
        filename = `peak-time-analysis-${fromDate || 'all'}-${toDate || 'all'}`;
        headers = ['Hour', 'Order Count', 'Total Revenue', 'Avg Order Value'];
        break;

      default:
        return res.status(400).json({
          status: 'error',
          message: 'Invalid report type. Use vendor-revenue, order-counts, or peak-time',
        });
    }

    // Format as CSV
    if (format === 'csv') {
      const csvRows = [
        headers.join(','),
        ...data.map(row => {
          if (reportType === 'vendor-revenue') {
            return [
              row.restaurantName,
              row.totalOrders,
              row.totalRevenue,
              row.commissionPercent,
              row.commissionAmount,
              row.vendorAmount,
              row.avgOrderValue,
            ].join(',');
          } else if (reportType === 'order-counts') {
            return [
              row._id,
              row.orderCount,
              row.completedOrders,
              row.cancelledOrders,
              row.totalRevenue,
            ].join(',');
          } else if (reportType === 'peak-time') {
            return [
              row.hour,
              row.orderCount,
              row.totalRevenue,
              row.avgOrderValue,
            ].join(',');
          }
        }),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csvRows);
    }

    // For Excel format, you would need a library like xlsx - for now return JSON
    res.status(200).json({
      status: 'success',
      data: {
        headers,
        data,
        filename,
        format,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to export data',
    });
  }
};
