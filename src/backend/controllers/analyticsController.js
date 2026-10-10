import Order from '../models/Order.js';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';
import mongoose from 'mongoose';

// Get comprehensive analytics - GET /api/analytics/overview
export const getAnalyticsOverview = async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    
    // Calculate date range based on period
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '1d':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get order statistics
    const orderStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          averageOrderValue: { $avg: '$total' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get user statistics
    const userStats = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get restaurant statistics
    const restaurantStats = await Restaurant.aggregate([
      {
        $match: {
          status: 'approved',
          isEnabled: true
        }
      },
      {
        $group: {
          _id: null,
          totalRestaurants: { $sum: 1 },
          averageRating: { $avg: '$rating' }
        }
      }
    ]);

    // Get rider statistics
    const riderStats = await User.aggregate([
      {
        $match: {
          role: 'rider',
          isOnline: true
        }
      },
      {
        $group: {
          _id: null,
          onlineRiders: { $sum: 1 },
          averageRating: { $avg: '$currentRating' }
        }
      }
    ]);

    // Get daily revenue trend
    const revenueTrend = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: now },
          status: 'Delivered'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get top restaurants
    const topRestaurants = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: now },
          status: 'Delivered'
        }
      },
      {
        $group: {
          _id: '$restaurantId',
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'restaurants',
          localField: '_id',
          foreignField: '_id',
          as: 'restaurant'
        }
      },
      { $unwind: '$restaurant' }
    ]);

    // Get top food items
    const topFoodItems = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: now },
          status: 'Delivered'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.foodItemId',
          totalOrdered: { $sum: '$items.quantity' }
        }
      },
      { $sort: { totalOrdered: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'fooditems',
          localField: '_id',
          foreignField: '_id',
          as: 'foodItem'
        }
      },
      { $unwind: '$foodItem' }
    ]);

    const stats = orderStats[0] || { totalOrders: 0, totalRevenue: 0, averageOrderValue: 0, completedOrders: 0 };
    const restStats = restaurantStats[0] || { totalRestaurants: 0, averageRating: 0 };
    const riderData = riderStats[0] || { onlineRiders: 0, averageRating: 0 };

    res.status(200).json({
      status: 'success',
      data: {
        overview: {
          totalOrders: stats.totalOrders,
          totalRevenue: stats.totalRevenue,
          averageOrderValue: stats.averageOrderValue || 0,
          completedOrders: stats.completedOrders,
          totalRestaurants: restStats.totalRestaurants,
          averageRestaurantRating: restStats.averageRating || 0,
          onlineRiders: riderData.onlineRiders,
          averageRiderRating: riderData.averageRating || 0,
        },
        userStats: userStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        revenueTrend: revenueTrend.map(item => ({
          date: item._id,
          revenue: item.revenue,
          orders: item.orders
        })),
        topRestaurants: topRestaurants.map(item => ({
          id: item._id,
          name: item.restaurant.name,
          totalOrders: item.totalOrders,
          totalRevenue: item.totalRevenue
        })),
        topFoodItems: topFoodItems.map(item => ({
          id: item._id,
          name: item.foodItem.name,
          totalOrdered: item.totalOrdered
        })),
        period
      }
    });

  } catch (error) {    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch analytics data',
    });
  }
};

// Get vendor-specific analytics - GET /api/analytics/vendor
export const getVendorAnalytics = async (req, res) => {
  try {
    const vendorId = req.user?._id || req.user?.id;
    const { period = '7d' } = req.query;

    if (!vendorId) {
      return res.status(401).json({
        status: 'error',
        message: 'Vendor authentication required',
      });
    }

    // Find vendor's restaurant
    const restaurant = await Restaurant.findOne({ owner: vendorId });
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '1d':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get order statistics for this restaurant
    const orderStats = await Order.aggregate([
      {
        $match: {
          restaurantId: restaurant._id,
          createdAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$total' },
          averageOrderValue: { $avg: '$total' },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] }
          }
        }
      }
    ]);

    // Get daily revenue trend
    const revenueTrend = await Order.aggregate([
      {
        $match: {
          restaurantId: restaurant._id,
          createdAt: { $gte: startDate, $lte: now },
          status: 'Delivered'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get top selling items
    const topItems = await Order.aggregate([
      {
        $match: {
          restaurantId: restaurant._id,
          createdAt: { $gte: startDate, $lte: now },
          status: 'Delivered'
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.foodItemId',
          totalOrdered: { $sum: '$items.quantity' },
          totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
        }
      },
      { $sort: { totalOrdered: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'fooditems',
          localField: '_id',
          foreignField: '_id',
          as: 'foodItem'
        }
      },
      { $unwind: '$foodItem' }
    ]);

    const stats = orderStats[0] || { totalOrders: 0, totalRevenue: 0, averageOrderValue: 0, completedOrders: 0 };

    res.status(200).json({
      status: 'success',
      data: {
        overview: {
          totalOrders: stats.totalOrders,
          totalRevenue: stats.totalRevenue,
          averageOrderValue: stats.averageOrderValue || 0,
          completedOrders: stats.completedOrders,
        },
        revenueTrend: revenueTrend.map(item => ({
          date: item._id,
          revenue: item.revenue,
          orders: item.orders
        })),
        topItems: topItems.map(item => ({
          id: item._id,
          name: item.foodItem.name,
          totalOrdered: item.totalOrdered,
          totalRevenue: item.totalRevenue
        })),
        period
      }
    });

  } catch (error) {    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch vendor analytics',
    });
  }
};

// Get rider-specific analytics - GET /api/analytics/rider
export const getRiderAnalytics = async (req, res) => {
  try {
    const riderId = req.user?._id || req.user?.id;
    const { period = '7d' } = req.query;

    if (!riderId) {
      return res.status(401).json({
        status: 'error',
        message: 'Rider authentication required',
      });
    }

    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    
    switch (period) {
      case '1d':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Get order statistics for this rider
    const orderStats = await Order.aggregate([
      {
        $match: {
          riderId: new mongoose.Types.ObjectId(riderId),
          createdAt: { $gte: startDate, $lte: now }
        }
      },
      {
        $group: {
          _id: null,
          totalDeliveries: { $sum: 1 },
          totalEarnings: { $sum: '$deliveryFee' },
          averageDeliveryTime: { $avg: '$deliveryTime' }
        }
      }
    ]);

    // Get daily earnings trend
    const earningsTrend = await Order.aggregate([
      {
        $match: {
          riderId: new mongoose.Types.ObjectId(riderId),
          createdAt: { $gte: startDate, $lte: now },
          status: 'Delivered'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          earnings: { $sum: '$deliveryFee' },
          deliveries: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const stats = orderStats[0] || { totalDeliveries: 0, totalEarnings: 0, averageDeliveryTime: 0 };

    res.status(200).json({
      status: 'success',
      data: {
        overview: {
          totalDeliveries: stats.totalDeliveries,
          totalEarnings: stats.totalEarnings,
          averageDeliveryTime: stats.averageDeliveryTime || 0,
        },
        earningsTrend: earningsTrend.map(item => ({
          date: item._id,
          earnings: item.earnings,
          deliveries: item.deliveries
        })),
        period
      }
    });

  } catch (error) {    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch rider analytics',
    });
  }
};
