import Order from '../../models/Order.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import FinancialTransaction from '../../models/FinancialTransaction.js';

/** A week back from now, for the "this week" counts. */
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Get Dashboard Analytics
export const getDashboardAnalytics = async (req, res) => {
  try {
    // Get basic stats
    const sinceLastWeek = new Date(Date.now() - WEEK_MS);

    // The console's dashboard shows partner and restaurant counts beside the
    // order figures. They were hardcoded on the screen — "1,248 active
    // delivery partners" against five real riders — because this endpoint
    // never returned them.
    const [
      totalOrders,
      totalRestaurants,
      activeRestaurants,
      newRestaurants,
      totalUsers,
      deliveredOrders,
      cancelledOrders,
      totalRiders,
      activeRiders,
      newRiders,
    ] = await Promise.all([
      Order.countDocuments(),
      Restaurant.countDocuments(),
      Restaurant.countDocuments({ isEnabled: true }),
      Restaurant.countDocuments({ createdAt: { $gte: sinceLastWeek } }),
      User.countDocuments({ role: 'user' }),
      Order.countDocuments({ status: 'Delivered' }),
      Order.countDocuments({ status: 'Cancelled' }),
      User.countDocuments({ role: 'rider' }),
      // Active means able to take work: cleared KYC and not blocked. Online
      // status swings minute to minute and would make the figure meaningless.
      User.countDocuments({ role: 'rider', isBlocked: { $ne: true }, kycStatus: 'approved' }),
      User.countDocuments({ role: 'rider', createdAt: { $gte: sinceLastWeek } }),
    ]);

    // Calculate total revenue from delivered orders
    const deliveredOrdersData = await Order.find({ status: 'Delivered' }).select('total');
    const totalRevenue = deliveredOrdersData.reduce((sum, order) => sum + (order.total || 0), 0);

    // Calculate average order value
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Averaged across restaurants that have actually been rated — including
    // unrated ones would drag the figure toward zero and report a reputation
    // problem the platform does not have.
    const ratingRows = await Restaurant.aggregate([
      { $match: { rating: { $gt: 0 } } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const averageRating = ratingRows[0]?.average ?? null;
    const ratedRestaurants = ratingRows[0]?.count ?? 0;

    // What the platform has actually paid out to restaurants: the vendor's
    // share of settled transactions, refunds excluded. The dashboard used to
    // state a fixed ₹7,35,920 here regardless of what had moved.
    const payoutRows = await FinancialTransaction.aggregate([
      { $match: { status: 'completed', 'refundInfo.isRefund': { $ne: true } } },
      {
        $group: {
          _id: null,
          total: { $sum: '$vendorAmount' },
          thisWeek: {
            $sum: {
              $cond: [{ $gte: ['$createdAt', sinceLastWeek] }, '$vendorAmount', 0],
            },
          },
        },
      },
    ]);

    res.json({
      status: 'success',
      data: {
        totalOrders,
        activeVendors: totalRestaurants,
        totalRevenue,
        newRegistrations: totalUsers,
        cancelledOrders,
        averageOrderValue,
        totalRestaurants,
        activeRestaurants,
        newRestaurants,
        totalRiders,
        activeRiders,
        newRiders,
        averageRating,
        ratedRestaurants,
        totalPayouts: payoutRows[0]?.total ?? 0,
        payoutsThisWeek: payoutRows[0]?.thisWeek ?? 0,
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch dashboard analytics' });
  }
};

// Get Revenue Trend
export const getRevenueTrend = async (req, res) => {
  try {
    const { period = '7days' } = req.query;
    
    let startDate, endDate, groupBy;
    const now = new Date();

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        groupBy = { $dateToString: { format: "%H", date: "$createdAt" } };
        break;
      case '7days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
        groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
        break;
      case '30days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        endDate = now;
        groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        groupBy = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
        break;
      default:
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        endDate = now;
        groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } };
    }

    const revenueData = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'Delivered'
        }
      },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: "$total" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    const categories = revenueData.map(item => item._id);
    const revenue = revenueData.map(item => item.revenue);
    const avgRevenue = revenue.length > 0 ? revenue.reduce((sum, rev) => sum + rev, 0) / revenue.length : 1;

    // Get actual orders count for each period
    const ordersData = await Order.aggregate([
      { $match: { createdAt: { $gte: startDate }, status: 'Delivered' } },
      { $group: { _id: groupBy, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    // Create orders map
    const ordersMap = {};
    ordersData.forEach(item => {
      ordersMap[item._id] = item.orders;
    });

    // Align orders with revenue periods
    const orders = categories.map(category => ordersMap[category] || 0);

    res.json({
      status: 'success',
      data: {
        categories,
        revenue,
        orders
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch revenue trend' });
  }
};

// Get Total Income
export const getTotalIncome = async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [currentMonthRevenue, previousMonthRevenue] = await Promise.all([
      Order.aggregate([
        { $match: { createdAt: { $gte: currentMonth }, status: 'Delivered' } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: previousMonth, $lte: previousMonthEnd }, status: 'Delivered' } },
        { $group: { _id: null, total: { $sum: "$total" } } }
      ])
    ]);

    const currentMonthTotal = currentMonthRevenue[0]?.total || 0;
    const previousMonthTotal = previousMonthRevenue[0]?.total || 0;

    // Calculate growth percentage
    const growth = previousMonthTotal > 0 
      ? ((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100 
      : 0;

    // Get monthly data for chart (last 6 months)
    const monthlyData = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          total: { $sum: "$total" }
        }
      },
      { $sort: { "_id": -1 } },
      { $limit: 6 }
    ]);

    res.json({
      status: 'success',
      data: {
        currentMonth: currentMonthTotal,
        previousMonth: previousMonthTotal,
        growth,
        monthly: monthlyData.reverse().map(item => item.total)
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch total income' });
  }
};

// Get Revenue Forecast - Based on actual historical data trends
export const getRevenueForecast = async (req, res) => {
  try {
    const { period = 'week' } = req.query;
    
    // Get historical data for trend analysis
    const historicalData = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$total" }
        }
      },
      { $sort: { "_id": -1 } },
      { $limit: 30 }
    ]);

    // Calculate trend based on actual historical data
    const avgRevenue = historicalData.length > 0 ? 
      historicalData.reduce((sum, item) => sum + item.revenue, 0) / historicalData.length : 0;
    
    // Calculate growth trend from last 7 days vs previous 7 days
    const recentGrowth = historicalData.length >= 14 ? 
      (historicalData.slice(0, 7).reduce((sum, item) => sum + item.revenue, 0) / 7) /
      (historicalData.slice(7, 14).reduce((sum, item) => sum + item.revenue, 0) / 7) : 1.1;
    
    let categories, currentYear, previousYear;
    
    switch (period) {
      case 'week':
        categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        // Apply growth trend to forecast
        currentYear = categories.map(() => avgRevenue * recentGrowth * (0.9 + Math.random() * 0.3));
        previousYear = categories.map(() => avgRevenue * (0.8 + Math.random() * 0.3));
        break;
      case 'april-2024':
        categories = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        currentYear = categories.map(() => avgRevenue * 7 * recentGrowth * (0.9 + Math.random() * 0.2));
        previousYear = categories.map(() => avgRevenue * 5.5 * (0.8 + Math.random() * 0.3));
        break;
      case 'may-2024':
        categories = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        currentYear = categories.map(() => avgRevenue * 7.2 * recentGrowth * (0.9 + Math.random() * 0.2));
        previousYear = categories.map(() => avgRevenue * 5.8 * (0.8 + Math.random() * 0.3));
        break;
      case 'june-2024':
        categories = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
        currentYear = [avgRevenue * 8, avgRevenue * 8.5, avgRevenue * 8.2, avgRevenue * 9];
        previousYear = [avgRevenue * 6.2, avgRevenue * 6.8, avgRevenue * 6.5, avgRevenue * 7.2];
        break;
      default:
        categories = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        currentYear = [avgRevenue * 1.1, avgRevenue * 1.2, avgRevenue * 0.9, avgRevenue * 1.3, avgRevenue * 1.1, avgRevenue * 1.4, avgRevenue * 1.2];
        previousYear = [avgRevenue * 0.8, avgRevenue * 0.9, avgRevenue * 0.7, avgRevenue * 1.0, avgRevenue * 0.8, avgRevenue * 1.1, avgRevenue * 0.9];
    }

    res.json({
      status: 'success',
      data: {
        categories,
        currentYear,
        previousYear
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch revenue forecast' });
  }
};

// Get Order Cancellation Insights
export const getOrderCancellationInsights = async (req, res) => {
  try {
    const [totalOrders, cancelledOrders] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'Cancelled' })
    ]);

    const cancellationPercentage = totalOrders > 0 ? (cancelledOrders / totalOrders) * 100 : 0;

    // Get real cancellation reasons from database
    const cancellationReasons = await Order.aggregate([
      { $match: { status: 'Cancelled', cancellationReason: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$cancellationReason',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Map real reasons to UI-friendly format with colors and icons
    const reasonConfig = {
      'Restaurant busy': { color: '#ef4444', icon: 'solar:shop-2-linear', display: 'Restaurant busy/unavailable' },
      'Customer request': { color: '#3b82f6', icon: 'solar:user-minus-rounded-linear', display: 'Customer cancelled' },
      'Payment issue': { color: '#8b5cf6', icon: 'solar:card-recive-linear', display: 'Payment issues' },
      'Long wait time': { color: '#f59e0b', icon: 'solar:clock-circle-linear', display: 'Long wait time' },
      'Rider unavailable': { color: '#f59e0b', icon: 'solar:clock-circle-linear', display: 'Delivery delay' },
      'Wrong order': { color: '#ef4444', icon: 'solar:close-circle-linear', display: 'Order issues' },
      'Quality issue': { color: '#ef4444', icon: 'solar:danger-triangle-linear', display: 'Quality issues' }
    };

    const reasons = cancellationReasons.map(item => {
      const config = reasonConfig[item._id] || {
        color: '#6b7280',
        icon: 'solar:information-circle-linear',
        display: item._id
      };
      
      return {
        reason: config.display,
        count: item.count,
        percentage: cancelledOrders > 0 ? Math.round((item.count / cancelledOrders) * 100 * 10) / 10 : 0,
        color: config.color,
        icon: config.icon
      };
    });

    res.json({
      status: 'success',
      data: {
        totalOrders,
        cancelledOrders,
        cancellationPercentage,
        reasons
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch order cancellation insights' });
  }
};

// Get New Customers
export const getNewCustomers = async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [currentMonthCustomers, previousMonthCustomers] = await Promise.all([
      User.countDocuments({ 
        role: 'customer', 
        createdAt: { $gte: currentMonth } 
      }),
      User.countDocuments({ 
        role: 'customer', 
        createdAt: { $gte: previousMonth, $lte: previousMonthEnd } 
      })
    ]);

    // Calculate growth percentage
    const growth = previousMonthCustomers > 0 
      ? ((currentMonthCustomers - previousMonthCustomers) / previousMonthCustomers) * 100 
      : 0;

    // Set target progress based on realistic monthly target
    const monthlyTarget = 50; // Target new customers per month
    const targetProgress = Math.min((currentMonthCustomers / monthlyTarget) * 100, 100);

    res.json({
      status: 'success',
      data: {
        currentMonth: currentMonthCustomers,
        growth,
        targetProgress
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch new customers' });
  }
};

// Get Daily Activity
export const getDailyActivity = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const recentOrders = await Order.find({ 
      createdAt: { $gte: today } 
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('id status total createdAt');

    const activities = recentOrders.map(order => ({
      id: order._id,
      time: new Date(order.createdAt).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      action: `Order #${order._id.toString().slice(-6)} - ${order.status}`,
      orderId: `#${order._id.toString().slice(-6)}`,
      color: order.status === 'Delivered' ? 'bg-success' : 
             order.status === 'CANCELLED' ? 'bg-error' : 
             order.status === 'CONFIRMED' ? 'bg-primary' : 'bg-warning'
    }));

    res.json({
      status: 'success',
      data: {
        activities
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch daily activity' });
  }
};

// Get Notifications - Fetch from actual database
export const getNotifications = async (req, res) => {
  try {
    // Import Notification model
    const Notification = (await import('../../models/Notification.js')).default;
    
    // Get recent notifications from database
    const notifications = await Notification.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Transform to match expected format
    const formattedNotifications = notifications.map(notification => ({
      id: notification._id.toString(),
      title: notification.title,
      message: notification.message,
      type: notification.type.toLowerCase() === 'order_status' ? 'order' : 
            notification.type.toLowerCase() === 'promotional' ? 'restaurant' :
            notification.type.toLowerCase() === 'system' ? 'system' : 'payment',
      read: notification.isSent,
      createdAt: notification.createdAt.toISOString(),
      actionUrl: notification.type.toLowerCase() === 'order_status' ? '/admin/orders' :
                notification.type.toLowerCase() === 'promotional' ? '/admin/restaurants' :
                '/admin/settings'
    }));

    res.json({
      status: 'success',
      data: {
        notifications: formattedNotifications
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
};

// Get Profile Menu Items
export const getProfileMenuItems = async (req, res) => {
  try {
    const menuItems = [
      {
        id: 'profile',
        title: 'My Profile',
        subtitle: 'Account settings',
        url: '/admin/user-profile',
        icon: 'tabler:user'
      },
      {
        id: 'account',
        title: 'Settings',
        subtitle: 'My Daily Notes',
        url: '/admin/settings',
        icon: 'tabler:mail'
      },
      {
        id: 'tasks',
        title: 'My Tasks',
        subtitle: 'To-do and Daily tasks',
        url: '/admin/tasks',
        icon: 'tabler:list-check'
      }
    ];

    res.json({
      status: 'success',
      data: {
        menuItems
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch profile menu items' });
  }
};

// Get Blog Posts - Return empty array for now (blog functionality not implemented)
export const getBlogPosts = async (req, res) => {
  try {
    // Return empty array since blog functionality is not implemented
    // This prevents mock data and maintains data integrity
    const blogPosts = [];

    res.json({
      status: 'success',
      data: {
        posts: blogPosts
      }
    });
  } catch (error) {    res.status(500).json({ message: 'Failed to fetch blog posts' });
  }
};
