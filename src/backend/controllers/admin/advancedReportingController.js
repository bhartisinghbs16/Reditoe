import Order from '../../models/Order.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import mongoose from 'mongoose';

class AdvancedReportingController {
  // Revenue analytics
  async getRevenueAnalytics(req, res) {
    try {
      const { startDate, endDate, groupBy = 'day' } = req.query;

      const matchStage = {
        $match: {
          status: { $in: ['Delivered', 'OnWay'] },
          paymentStatus: 'paid'
        }
      };

      if (startDate || endDate) {
        matchStage.$match.createdAt = {};
        if (startDate) matchStage.$match.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.$match.createdAt.$lte = new Date(endDate);
      }

      const groupFormat = groupBy === 'month' ? '%Y-%m' : groupBy === 'week' ? '%Y-%U' : '%Y-%m-%d';
      
      const revenueData = await Order.aggregate([
        matchStage,
        {
          $group: {
            _id: {
              $dateToString: {
                format: groupFormat,
                date: '$createdAt'
              }
            },
            totalRevenue: { $sum: '$total' },
            orderCount: { $sum: 1 },
            averageOrderValue: { $avg: '$total' },
            commissionRevenue: { 
              $sum: { 
                $multiply: ['$subtotal', { $divide: ['$commissionPercent', 100] }] 
              } 
            },
            gstRevenue: { $sum: '$gstAndPackaging' },
            platformFeeRevenue: { $sum: '$platformFee' }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // Get overall totals
      const totals = await Order.aggregate([
        matchStage,
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total' },
            totalOrders: { $sum: 1 },
            totalCommission: { 
              $sum: { 
                $multiply: ['$subtotal', { $divide: ['$commissionPercent', 100] }] 
              } 
            },
            totalGST: { $sum: '$gstAndPackaging' },
            totalPlatformFees: { $sum: '$platformFee' },
            averageOrderValue: { $avg: '$total' }
          }
        }
      ]);

      res.json({
        status: 'success',
        data: {
          revenueData,
          totals: totals[0] || {},
          groupBy
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get revenue analytics'
      });
    }
  }

  // Vendor commission analytics
  async getVendorCommissionAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const matchStage = {
        $match: {
          status: { $in: ['Delivered', 'OnWay'] },
          paymentStatus: 'paid'
        }
      };

      if (startDate || endDate) {
        matchStage.$match.createdAt = {};
        if (startDate) matchStage.$match.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.$match.createdAt.$lte = new Date(endDate);
      }

      const vendorData = await Order.aggregate([
        matchStage,
        {
          $lookup: {
            from: 'restaurants',
            localField: 'restaurantId',
            foreignField: '_id',
            as: 'restaurant'
          }
        },
        { $unwind: '$restaurant' },
        {
          $group: {
            _id: '$restaurantId',
            restaurantName: { $first: '$restaurant.name' },
            restaurantEmail: { $first: '$restaurant.email' },
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$total' },
            commissionAmount: { 
              $sum: { 
                $multiply: ['$subtotal', { $divide: ['$commissionPercent', 100] }] 
              } 
            },
            commissionPercent: { $first: '$commissionPercent' },
            averageOrderValue: { $avg: '$total' },
            gstAmount: { $sum: '$gstAndPackaging' },
            platformFees: { $sum: '$platformFee' },
            settlementAmount: {
              $sum: {
                $subtract: [
                  '$total',
                  {
                    $add: [
                      { $multiply: ['$subtotal', { $divide: ['$commissionPercent', 100] }] },
                      '$gstAndPackaging',
                      '$platformFee'
                    ]
                  }
                ]
              }
            }
          }
        },
        { $sort: { commissionAmount: -1 } }
      ]);

      // Get commission totals
      const totals = await Order.aggregate([
        matchStage,
        {
          $group: {
            _id: null,
            totalCommission: { 
              $sum: { 
                $multiply: ['$subtotal', { $divide: ['$commissionPercent', 100] }] 
              } 
            },
            totalSettlement: {
              $sum: {
                $subtract: [
                  '$total',
                  {
                    $add: [
                      { $multiply: ['$subtotal', { $divide: ['$commissionPercent', 100] }] },
                      '$gstAndPackaging',
                      '$platformFee'
                    ]
                  }
                ]
              }
            }
          }
        }
      ]);

      res.json({
        status: 'success',
        data: {
          vendorData,
          totals: totals[0] || {}
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get vendor commission analytics'
      });
    }
  }

  // Rider payout analytics
  async getRiderPayoutAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const matchStage = {
        $match: {
          status: { $in: ['Delivered', 'OnWay'] },
          paymentStatus: 'paid',
          riderId: { $ne: null }
        }
      };

      if (startDate || endDate) {
        matchStage.$match.createdAt = {};
        if (startDate) matchStage.$match.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.$match.createdAt.$lte = new Date(endDate);
      }

      const riderData = await Order.aggregate([
        matchStage,
        {
          $lookup: {
            from: 'users',
            localField: 'riderId',
            foreignField: '_id',
            as: 'rider'
          }
        },
        { $unwind: '$rider' },
        {
          $group: {
            _id: '$riderId',
            riderName: { $first: '$rider.name' },
            riderEmail: { $first: '$rider.email' },
            riderPhone: { $first: '$rider.phone' },
            totalOrders: { $sum: 1 },
            totalEarnings: { $sum: '$deliveryFee' },
            averageDeliveryFee: { $avg: '$deliveryFee' },
            totalDistance: { $sum: '$deliveryDistance' }, // If distance is tracked
            successRate: {
              $avg: {
                $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0]
              }
            }
          }
        },
        { $sort: { totalEarnings: -1 } }
      ]);

      // Get payout totals
      const totals = await Order.aggregate([
        matchStage,
        {
          $group: {
            _id: null,
            totalPayouts: { $sum: '$deliveryFee' },
            totalRiderOrders: { $sum: 1 },
            averagePayout: { $avg: '$deliveryFee' }
          }
        }
      ]);

      res.json({
        status: 'success',
        data: {
          riderData,
          totals: totals[0] || {}
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get rider payout analytics'
      });
    }
  }

  // Refund analytics
  async getRefundAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const matchStage = {
        $match: {
          'refundInfo.isRefunded': true
        }
      };

      if (startDate || endDate) {
        matchStage.$match['refundInfo.refundDate'] = {};
        if (startDate) matchStage.$match['refundInfo.refundDate'].$gte = new Date(startDate);
        if (endDate) matchStage.$match['refundInfo.refundDate'].$lte = new Date(endDate);
      }

      const refundData = await Order.aggregate([
        matchStage,
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        {
          $lookup: {
            from: 'restaurants',
            localField: 'restaurantId',
            foreignField: '_id',
            as: 'restaurant'
          }
        },
        { $unwind: '$restaurant' },
        {
          $group: {
            _id: {
              year: { $year: '$refundInfo.refundDate' },
              month: { $month: '$refundInfo.refundDate' }
            },
            totalRefunds: { $sum: 1 },
            totalRefundAmount: { $sum: '$refundInfo.refundAmount' },
            averageRefundAmount: { $avg: '$refundInfo.refundAmount' },
            refundReasons: {
              $push: '$refundInfo.refundReason'
            }
          }
        },
        { $sort: { '_id.year': -1, '_id.month': -1 } }
      ]);

      // Refund reasons analysis
      const reasonsData = await Order.aggregate([
        matchStage,
        {
          $group: {
            _id: '$refundInfo.refundReason',
            count: { $sum: 1 },
            totalAmount: { $sum: '$refundInfo.refundAmount' },
            averageAmount: { $avg: '$refundInfo.refundAmount' }
          }
        },
        { $sort: { count: -1 } }
      ]);

      // Get refund totals
      const totals = await Order.aggregate([
        matchStage,
        {
          $group: {
            _id: null,
            totalRefunds: { $sum: 1 },
            totalRefundAmount: { $sum: '$refundInfo.refundAmount' },
            averageRefundAmount: { $avg: '$refundInfo.refundAmount' }
          }
        }
      ]);

      res.json({
        status: 'success',
        data: {
          refundData,
          reasonsData,
          totals: totals[0] || {}
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get refund analytics'
      });
    }
  }

  // Active users analytics
  async getActiveUsersAnalytics(req, res) {
    try {
      const { period = '30' } = req.query; // Default last 30 days
      
      const daysAgo = parseInt(period);
      const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

      // Daily active users (users who placed orders)
      const dailyActiveUsers = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            activeUsers: { $addToSet: '$userId' },
            orderCount: { $sum: 1 }
          }
        },
        {
          $project: {
            date: '$_id',
            activeUserCount: { $size: '$activeUsers' },
            orderCount: 1
          }
        },
        { $sort: { date: 1 } }
      ]);

      // User registration trends
      const registrationTrends = await User.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$createdAt'
              }
            },
            newUsers: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      // User role distribution
      const roleDistribution = await User.aggregate([
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 }
          }
        }
      ]);

      // Overall user stats
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.distinct('userId', { 
        createdAt: { $gte: startDate } 
      }).then(users => users.length);

      res.json({
        status: 'success',
        data: {
          dailyActiveUsers,
          registrationTrends,
          roleDistribution,
          summary: {
            totalUsers,
            activeUsers,
            period: `${daysAgo} days`
          }
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get active users analytics'
      });
    }
  }

  // Order heatmaps (basic aggregation by location)
  async getOrderHeatmap(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const matchStage = {
        $match: {
          status: { $in: ['Delivered', 'OnWay'] },
          'deliveryAddress.coordinates': { $exists: true }
        }
      };

      if (startDate || endDate) {
        matchStage.$match.createdAt = {};
        if (startDate) matchStage.$match.createdAt.$gte = new Date(startDate);
        if (endDate) matchStage.$match.createdAt.$lte = new Date(endDate);
      }

      // Aggregate orders by location (rounded coordinates for heatmap)
      const heatmapData = await Order.aggregate([
        matchStage,
        {
          $project: {
            lat: { $round: ['$deliveryAddress.coordinates.latitude', 3] },
            lng: { $round: ['$deliveryAddress.coordinates.longitude', 3] },
            total: 1,
            status: 1
          }
        },
        {
          $group: {
            _id: { lat: '$lat', lng: '$lng' },
            orderCount: { $sum: 1 },
            totalRevenue: { $sum: '$total' },
            averageOrderValue: { $avg: '$total' },
            coordinates: { $first: { lat: '$lat', lng: '$lng' } }
          }
        },
        {
          $project: {
            coordinates: '$_id',
            orderCount: 1,
            totalRevenue: 1,
            averageOrderValue: 1,
            intensity: { $multiply: ['$orderCount', 10] } // Scale for heatmap intensity
          }
        },
        { $sort: { orderCount: -1 } },
        { $limit: 1000 } // Limit to prevent too much data
      ]);

      res.json({
        status: 'success',
        data: {
          heatmapData,
          totalPoints: heatmapData.length
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get order heatmap'
      });
    }
  }

  // Comprehensive dashboard data
  async getDashboardAnalytics(req, res) {
    try {
      const { period = '30' } = req.query;
      const daysAgo = parseInt(period);
      const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

      // Get all analytics data in parallel
      const [
        revenueData,
        vendorData,
        riderData,
        refundData,
        userData,
        orderStats
      ] = await Promise.all([
        this.getRevenueData(startDate),
        this.getVendorData(startDate),
        this.getRiderData(startDate),
        this.getRefundData(startDate),
        this.getUserData(startDate),
        this.getOrderStats(startDate)
      ]);

      res.json({
        status: 'success',
        data: {
          revenue: revenueData,
          vendors: vendorData,
          riders: riderData,
          refunds: refundData,
          users: userData,
          orders: orderStats,
          period: `Last ${daysAgo} days`
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get dashboard analytics'
      });
    }
  }

  // Helper methods for dashboard
  async getRevenueData(startDate) {
    const matchStage = {
      $match: {
        status: { $in: ['Delivered', 'OnWay'] },
        paymentStatus: 'paid',
        createdAt: { $gte: startDate }
      }
    };

    const result = await Order.aggregate([
      matchStage,
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          totalOrders: { $sum: 1 },
          averageOrderValue: { $avg: '$total' },
          commissionRevenue: { 
            $sum: { 
              $multiply: ['$subtotal', { $divide: ['$commissionPercent', 100] }] 
            } 
          }
        }
      }
    ]);

    return result[0] || { totalRevenue: 0, totalOrders: 0, averageOrderValue: 0, commissionRevenue: 0 };
  }

  async getVendorData(startDate) {
    const result = await Restaurant.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: null,
          newVendors: { $sum: 1 },
          activeVendors: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] }
          }
        }
      }
    ]);

    return result[0] || { newVendors: 0, activeVendors: 0 };
  }

  async getRiderData(startDate) {
    const result = await Order.aggregate([
      {
        $match: {
          riderId: { $ne: null },
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalPayouts: { $sum: '$deliveryFee' },
          activeRiders: { $addToSet: '$riderId' }
        }
      },
      {
        $project: {
          totalPayouts: 1,
          activeRiderCount: { $size: '$activeRiders' }
        }
      }
    ]);

    return result[0] || { totalPayouts: 0, activeRiderCount: 0 };
  }

  async getRefundData(startDate) {
    const result = await Order.aggregate([
      {
        $match: {
          'refundInfo.isRefunded': true,
          'refundInfo.refundDate': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          totalRefunds: { $sum: 1 },
          totalRefundAmount: { $sum: '$refundInfo.refundAmount' }
        }
      }
    ]);

    return result[0] || { totalRefunds: 0, totalRefundAmount: 0 };
  }

  async getUserData(startDate) {
    const result = await User.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: null,
          newUsers: { $sum: 1 },
          activeUsers: { $addToSet: '$_id' }
        }
      },
      {
        $project: {
          newUsers: 1,
          activeUserCount: { $size: '$activeUsers' }
        }
      }
    ]);

    return result[0] || { newUsers: 0, activeUserCount: 0 };
  }

  async getOrderStats(startDate) {
    const result = await Order.aggregate([
      {
        $match: { createdAt: { $gte: startDate } }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    return result.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
  }
}

export default new AdvancedReportingController();
