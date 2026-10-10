/**
 * Advanced Analytics Controller for deep BI insights
 * Additive only - does not modify existing analytics
 */
import AdvancedAnalytics from '../../models/AdvancedAnalytics.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import FinancialTransaction from '../../models/FinancialTransaction.js';
import Restaurant from '../../models/Restaurant.js';
import mongoose from 'mongoose';

/**
 * Get advanced analytics overview
 */
export const getAnalyticsOverview = async (req, res) => {
  try {
    const { organizationId, period = 'daily', startDate, endDate } = req.query;
    
    // Default to last 30 days if no dates provided
    const defaultEndDate = new Date();
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    
    const start = startDate ? new Date(startDate) : defaultStartDate;
    const end = endDate ? new Date(endDate) : defaultEndDate;
    
    // Build organization filter
    const orgFilter = organizationId ? { organizationId } : {};
    
    // Get or generate analytics
    let analytics = await AdvancedAnalytics.getLatestAnalytics(organizationId, period);
    
    if (!analytics || analytics.startDate < start || analytics.endDate > end) {
      // Generate new analytics for the requested period
      analytics = await generateAnalyticsData(organizationId, period, start, end, req.user._id);
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        analytics,
        period: {
          start,
          end,
          type: period
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching analytics overview',
      error: error.message
    });
  }
};

/**
 * Get profit breakdown analytics
 */
export const getProfitBreakdown = async (req, res) => {
  try {
    const { organizationId, startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    const orgFilter = organizationId ? { organizationId } : {};
    
    // Aggregate financial transactions
    const profitData = await FinancialTransaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          ...orgFilter
        }
      },
      {
        $group: {
          _id: '$type',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      },
      {
        $sort: { totalAmount: -1 }
      }
    ]);
    
    // Calculate profit metrics
    const totalRevenue = profitData
      .filter(t => ['order_payment', 'commission'].includes(t._id))
      .reduce((sum, t) => sum + t.totalAmount, 0);
    
    const totalCosts = profitData
      .filter(t => ['settlement', 'fee'].includes(t._id))
      .reduce((sum, t) => sum + t.totalAmount, 0);
    
    const netProfit = totalRevenue - totalCosts;
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
    
    // Get breakdown by category
    const breakdown = [
      {
        category: 'commission',
        amount: profitData.find(t => t._id === 'commission')?.totalAmount || 0,
        percentage: totalRevenue > 0 ? ((profitData.find(t => t._id === 'commission')?.totalAmount || 0) / totalRevenue) * 100 : 0
      },
      {
        category: 'delivery',
        amount: profitData.find(t => t._id === 'settlement')?.totalAmount || 0,
        percentage: totalRevenue > 0 ? ((profitData.find(t => t._id === 'settlement')?.totalAmount || 0) / totalRevenue) * 100 : 0
      },
      {
        category: 'fees',
        amount: profitData.find(t => t._id === 'fee')?.totalAmount || 0,
        percentage: totalRevenue > 0 ? ((profitData.find(t => t._id === 'fee')?.totalAmount || 0) / totalRevenue) * 100 : 0
      }
    ];
    
    res.status(200).json({
      status: 'success',
      data: {
        profitBreakdown: {
          totalRevenue,
          totalCosts,
          netProfit,
          profitMargin,
          breakdown,
          transactions: profitData
        },
        period: { start, end }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching profit breakdown',
      error: error.message
    });
  }
};

/**
 * Get trend analysis (hourly/daily)
 */
export const getTrendAnalysis = async (req, res) => {
  try {
    const { organizationId, period = 'daily', startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    const orgFilter = organizationId ? { organizationId } : {};
    
    let groupBy;
    let dateField;
    
    switch (period) {
      case 'hourly':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' },
          hour: { $hour: '$createdAt' }
        };
        dateField = { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } };
        break;
      case 'daily':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
        dateField = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
        break;
      case 'weekly':
        groupBy = {
          year: { $year: '$createdAt' },
          week: { $week: '$createdAt' }
        };
        dateField = { $dateToString: { format: '%Y-%U', date: '$createdAt' } };
        break;
      case 'monthly':
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        };
        dateField = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
        break;
      default:
        groupBy = {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        };
        dateField = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
    }
    
    // Order trends
    const orderTrends = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          ...orgFilter
        }
      },
      {
        $group: {
          _id: groupBy,
          orders: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
          averageOrderValue: { $avg: '$totalAmount' }
        }
      },
      {
        $project: {
          date: dateField,
          orders: 1,
          revenue: 1,
          averageOrderValue: 1
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);
    
    // User registration trends
    const userTrends = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          ...orgFilter
        }
      },
      {
        $group: {
          _id: groupBy,
          newUsers: { $sum: 1 }
        }
      },
      {
        $project: {
          date: dateField,
          newUsers: 1
        }
      },
      {
        $sort: { date: 1 }
      }
    ]);
    
    // Merge trends
    const mergedTrends = mergeTrendData(orderTrends, userTrends, period);
    
    res.status(200).json({
      status: 'success',
      data: {
        trends: mergedTrends,
        period: { start, end, type: period }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching trend analysis',
      error: error.message
    });
  }
};

/**
 * Get geographic heatmap data
 */
export const getGeographicHeatmap = async (req, res) => {
  try {
    const { organizationId, startDate, endDate } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    const orgFilter = organizationId ? { organizationId } : {};
    
    // Get orders with location data
    const heatmapData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          'deliveryAddress.coordinates': { $exists: true },
          ...orgFilter
        }
      },
      {
        $group: {
          _id: {
            // Group by approximate coordinates (rounded for clustering)
            lat: { $round: ['$deliveryAddress.coordinates.latitude', 3] },
            lng: { $round: ['$deliveryAddress.coordinates.longitude', 3] }
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalAmount' },
          uniqueUsers: { $addToSet: '$userId' }
        }
      },
      {
        $project: {
          coordinates: {
            latitude: '$_id.lat',
            longitude: '$_id.lng'
          },
          orders: 1,
          revenue: 1,
          users: { $size: '$uniqueUsers' },
          density: { $sum: 1 }
        }
      },
      {
        $sort: { orders: -1 }
      },
      {
        $limit: 1000 // Limit to prevent overwhelming data
      }
    ]);
    
    // Get time-based patterns for each hotspot
    const heatmapWithTimeData = await Promise.all(
      heatmapData.map(async (point) => {
        const hourlyData = await Order.aggregate([
          {
            $match: {
              createdAt: { $gte: start, $lte: end },
              'deliveryAddress.coordinates.latitude': {
                $gte: point.coordinates.latitude - 0.001,
                $lte: point.coordinates.latitude + 0.001
              },
              'deliveryAddress.coordinates.longitude': {
                $gte: point.coordinates.longitude - 0.001,
                $lte: point.coordinates.longitude + 0.001
              },
              ...orgFilter
            }
          },
          {
            $group: {
              _id: { $hour: '$createdAt' },
              orders: { $sum: 1 },
              revenue: { $sum: '$totalAmount' }
            }
          },
          {
            $project: {
              hour: '$_id',
              orders: 1,
              revenue: 1
            }
          },
          {
            $sort: { hour: 1 }
          }
        ]);
        
        return {
          ...point,
          timeData: hourlyData
        };
      })
    );
    
    res.status(200).json({
      status: 'success',
      data: {
        heatmap: heatmapWithTimeData,
        period: { start, end }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching geographic heatmap',
      error: error.message
    });
  }
};

/**
 * Get vendor performance analytics
 */
export const getVendorPerformance = async (req, res) => {
  try {
    const { organizationId, startDate, endDate, limit = 50 } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    const orgFilter = organizationId ? { organizationId } : {};
    
    const vendorPerformance = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          ...orgFilter
        }
      },
      {
        $group: {
          _id: '$restaurantId',
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          averageOrderValue: { $avg: '$totalAmount' },
          uniqueUsers: { $addToSet: '$userId' },
          orderIds: { $push: '$_id' }
        }
      },
      {
        $lookup: {
          from: 'restaurants',
          localField: '_id',
          foreignField: '_id',
          as: 'restaurant'
        }
      },
      {
        $unwind: '$restaurant'
      },
      {
        $lookup: {
          from: 'financialtransactions',
          localField: 'orderIds',
          foreignField: 'orderId',
          as: 'transactions'
        }
      },
      {
        $project: {
          vendorId: '$_id',
          vendorName: '$restaurant.name',
          totalOrders: 1,
          totalRevenue: 1,
          averageOrderValue: 1,
          uniqueUsers: { $size: '$uniqueUsers' },
          commissionGenerated: {
            $sum: {
              $filter: {
                input: '$transactions',
                cond: { $eq: ['$$this.type', 'commission'] }
              }
            }
          },
          rating: '$restaurant.rating',
          isActive: '$restaurant.isActive'
        }
      },
      {
        $sort: { totalRevenue: -1 }
      },
      {
        $limit: parseInt(limit)
      }
    ]);
    
    // Calculate growth rates (compare with previous period)
    const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const previousEnd = start;
    
    const vendorGrowth = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: previousStart, $lte: previousEnd },
          ...orgFilter
        }
      },
      {
        $group: {
          _id: '$restaurantId',
          previousOrders: { $sum: 1 },
          previousRevenue: { $sum: '$totalAmount' }
        }
      }
    ]);
    
    // Merge growth data
    const vendorsWithGrowth = vendorPerformance.map(vendor => {
      const previousData = vendorGrowth.find(v => v._id.equals(vendor.vendorId));
      const orderGrowth = previousData ? ((vendor.totalOrders - previousData.previousOrders) / previousData.previousOrders) * 100 : 0;
      const revenueGrowth = previousData ? ((vendor.totalRevenue - previousData.previousRevenue) / previousData.previousRevenue) * 100 : 0;
      
      return {
        ...vendor,
        trends: {
          orderGrowth,
          revenueGrowth
        }
      };
    });
    
    res.status(200).json({
      status: 'success',
      data: {
        vendors: vendorsWithGrowth,
        period: { start, end }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching vendor performance',
      error: error.message
    });
  }
};

/**
 * Export analytics data
 */
export const exportAnalytics = async (req, res) => {
  try {
    const { organizationId, period, startDate, endDate, format = 'json' } = req.query;
    
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate ? new Date(endDate) : new Date();
    
    // Get comprehensive analytics data
    const [overview, profitData, trends, vendors] = await Promise.all([
      getAnalyticsOverviewData(organizationId, start, end),
      getProfitBreakdownData(organizationId, start, end),
      getTrendAnalysisData(organizationId, period, start, end),
      getVendorPerformanceData(organizationId, start, end)
    ]);
    
    const exportData = {
      metadata: {
        organizationId,
        period,
        startDate: start,
        endDate: end,
        exportedAt: new Date(),
        exportedBy: req.user._id
      },
      overview,
      profitBreakdown: profitData,
      trends,
      vendorPerformance: vendors
    };
    
    if (format === 'csv') {
      // Convert to CSV format (simplified)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics-${start.toISOString().split('T')[0]}-${end.toISOString().split('T')[0]}.csv`);
      return res.send(convertToCSV(exportData));
    }
    
    res.status(200).json({
      status: 'success',
      data: exportData
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error exporting analytics',
      error: error.message
    });
  }
};

// Helper functions
async function generateAnalyticsData(organizationId, period, startDate, endDate, userId) {
  // This would implement the actual analytics generation logic
  // For now, create a basic analytics record
  const analytics = new AdvancedAnalytics({
    organizationId,
    period,
    startDate,
    endDate,
    generatedBy: userId,
    overview: {
      totalOrders: 0,
      totalRevenue: 0,
      totalUsers: 0,
      totalVendors: 0,
      totalRiders: 0,
      averageOrderValue: 0,
      growthRates: {
        orders: 0,
        revenue: 0,
        users: 0,
        vendors: 0
      }
    }
  });
  
  return analytics.save();
}

function mergeTrendData(orderTrends, userTrends, period) {
  const merged = {};
  
  // Merge order trends
  orderTrends.forEach(trend => {
    merged[trend.date] = {
      date: trend.date,
      orders: trend.orders,
      revenue: trend.revenue,
      averageOrderValue: trend.averageOrderValue,
      newUsers: 0
    };
  });
  
  // Merge user trends
  userTrends.forEach(trend => {
    if (merged[trend.date]) {
      merged[trend.date].newUsers = trend.newUsers;
    } else {
      merged[trend.date] = {
        date: trend.date,
        orders: 0,
        revenue: 0,
        averageOrderValue: 0,
        newUsers: trend.newUsers
      };
    }
  });
  
  return Object.values(merged).sort((a, b) => a.date.localeCompare(b.date));
}

function convertToCSV(data) {
  // Simplified CSV conversion
  const headers = ['Date', 'Orders', 'Revenue', 'Users', 'Vendors'];
  const rows = data.trends?.trends?.map(t => [
    t.date,
    t.orders,
    t.revenue,
    t.newUsers,
    ''
  ]) || [];
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

// Additional helper functions for data fetching
async function getAnalyticsOverviewData(organizationId, start, end) {
  // Implementation for overview data
  return {};
}

async function getProfitBreakdownData(organizationId, start, end) {
  // Implementation for profit data
  return {};
}

async function getTrendAnalysisData(organizationId, period, start, end) {
  // Implementation for trend data
  return [];
}

async function getVendorPerformanceData(organizationId, start, end) {
  // Implementation for vendor data
  return [];
}
