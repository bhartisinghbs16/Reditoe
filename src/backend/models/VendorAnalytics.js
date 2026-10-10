/**
 * Vendor Analytics model for tracking vendor performance metrics
 */
import mongoose from 'mongoose';

const dailyMetricSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  totalOrders: {
    type: Number,
    default: 0,
    min: 0,
  },
  completedOrders: {
    type: Number,
    default: 0,
    min: 0,
  },
  cancelledOrders: {
    type: Number,
    default: 0,
    min: 0,
  },
  grossRevenue: {
    type: Number,
    default: 0,
    min: 0,
  },
  netRevenue: {
    type: Number,
    default: 0,
    min: 0,
  },
  averageOrderValue: {
    type: Number,
    default: 0,
    min: 0,
  },
  averagePreparationTime: {
    type: Number,
    default: 0,
    min: 0, // in minutes
  },
  customerRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  ratingCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  commissionEarned: {
    type: Number,
    default: 0,
    min: 0,
  },
  platformFeeEarned: {
    type: Number,
    default: 0,
    min: 0,
  },
}, {
  _id: true,
});

const vendorAnalyticsSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Vendor ID is required'],
    unique: true,
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Restaurant ID is required'],
  },
  period: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    default: 'daily',
  },
  dailyMetrics: [dailyMetricSchema],
  weeklyMetrics: [dailyMetricSchema], // Reuse same schema for weekly
  monthlyMetrics: [dailyMetricSchema], // Reuse same schema for monthly
  yearlyMetrics: [dailyMetricSchema], // Reuse same schema for yearly
  
  // Overall stats (calculated from all metrics)
  overallStats: {
    totalOrders: {
      type: Number,
      default: 0,
      min: 0,
    },
    completedOrders: {
      type: Number,
      default: 0,
      min: 0,
    },
    cancelledOrders: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    averageOrderValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    averagePreparationTime: {
      type: Number,
      default: 0,
      min: 0,
    },
    overallRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalRatings: {
      type: Number,
      default: 0,
      min: 0,
    },
    cancellationRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    completionRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    totalCommission: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPlatformFee: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  
  // Performance trends
  trends: {
    salesGrowth: {
      daily: Number, // percentage
      weekly: Number,
      monthly: Number,
    },
    orderGrowth: {
      daily: Number,
      weekly: Number,
      monthly: Number,
    },
    ratingTrend: {
      daily: Number,
      weekly: Number,
      monthly: Number,
    },
  },
  
  // Performance flags
  performanceFlags: {
    isHighPerformer: {
      type: Boolean,
      default: false,
    },
    isLowPerformer: {
      type: Boolean,
      default: false,
    },
    hasHighCancellationRate: {
      type: Boolean,
      default: false,
    },
    hasLowRating: {
      type: Boolean,
      default: false,
    },
    hasLongPreparationTime: {
      type: Boolean,
      default: false,
    },
  },
  
  // Ranking information
  ranking: {
    overallRank: Number,
    totalVendors: Number,
    percentile: Number,
    categoryRank: Number,
    categoryTotal: Number,
  },
  
  lastUpdated: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Method to add daily metric
vendorAnalyticsSchema.methods.addDailyMetric = function(date, orderData) {
  const existingMetric = this.dailyMetrics.find(m => 
    new Date(m.date).toDateString() === new Date(date).toDateString()
  );
  
  const metric = {
    date: new Date(date),
    totalOrders: orderData.totalOrders || 0,
    completedOrders: orderData.completedOrders || 0,
    cancelledOrders: orderData.cancelledOrders || 0,
    grossRevenue: orderData.grossRevenue || 0,
    netRevenue: orderData.netRevenue || 0,
    averageOrderValue: orderData.averageOrderValue || 0,
    averagePreparationTime: orderData.averagePreparationTime || 0,
    customerRating: orderData.customerRating || 0,
    ratingCount: orderData.ratingCount || 0,
    commissionEarned: orderData.commissionEarned || 0,
    platformFeeEarned: orderData.platformFeeEarned || 0,
  };
  
  if (existingMetric) {
    Object.assign(existingMetric, metric);
  } else {
    this.dailyMetrics.push(metric);
  }
  
  this.lastUpdated = new Date();
  return this.calculateOverallStats();
};

// Calculate overall statistics
vendorAnalyticsSchema.methods.calculateOverallStats = function() {
  const stats = {
    totalOrders: 0,
    completedOrders: 0,
    cancelledOrders: 0,
    totalRevenue: 0,
    averageOrderValue: 0,
    averagePreparationTime: 0,
    overallRating: 0,
    totalRatings: 0,
    cancellationRate: 0,
    completionRate: 0,
    totalCommission: 0,
    totalPlatformFee: 0,
  };
  
  this.dailyMetrics.forEach(metric => {
    stats.totalOrders += metric.totalOrders;
    stats.completedOrders += metric.completedOrders;
    stats.cancelledOrders += metric.cancelledOrders;
    stats.totalRevenue += metric.grossRevenue;
    stats.averageOrderValue += metric.averageOrderValue;
    stats.averagePreparationTime += metric.averagePreparationTime;
    stats.overallRating += metric.customerRating * metric.ratingCount;
    stats.totalRatings += metric.ratingCount;
    stats.totalCommission += metric.commissionEarned;
    stats.totalPlatformFee += metric.platformFeeEarned;
  });
  
  // Calculate averages and rates
  if (this.dailyMetrics.length > 0) {
    stats.averageOrderValue = stats.totalOrders > 0 ? stats.totalRevenue / stats.totalOrders : 0;
    stats.averagePreparationTime = stats.completedOrders > 0 ? 
      stats.averagePreparationTime / stats.completedOrders : 0;
    stats.overallRating = stats.totalRatings > 0 ? stats.overallRating / stats.totalRatings : 0;
    stats.cancellationRate = stats.totalOrders > 0 ? 
      (stats.cancelledOrders / stats.totalOrders) * 100 : 0;
    stats.completionRate = stats.totalOrders > 0 ? 
      (stats.completedOrders / stats.totalOrders) * 100 : 0;
  }
  
  this.overallStats = stats;
  
  // Update performance flags
  this.updatePerformanceFlags();
  
  return this.save();
};

// Update performance flags based on stats
vendorAnalyticsSchema.methods.updatePerformanceFlags = function() {
  const stats = this.overallStats;
  
  this.performanceFlags = {
    isHighPerformer: stats.overallRating >= 4.5 && stats.completionRate >= 95 && stats.cancellationRate <= 2,
    isLowPerformer: stats.overallRating < 3.0 || stats.completionRate < 80 || stats.cancellationRate > 10,
    hasHighCancellationRate: stats.cancellationRate > 10,
    hasLowRating: stats.overallRating < 3.0,
    hasLongPreparationTime: stats.averagePreparationTime > 30,
  };
};

// Get trends for last N days
vendorAnalyticsSchema.methods.getTrends = function(days = 7) {
  const recentMetrics = this.dailyMetrics
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, days);
  
  if (recentMetrics.length < 2) return { salesGrowth: 0, orderGrowth: 0, ratingTrend: 0 };
  
  const latest = recentMetrics[0];
  const previous = recentMetrics[recentMetrics.length - 1];
  
  return {
    salesGrowth: previous.grossRevenue > 0 ? 
      ((latest.grossRevenue - previous.grossRevenue) / previous.grossRevenue) * 100 : 0,
    orderGrowth: previous.totalOrders > 0 ? 
      ((latest.totalOrders - previous.totalOrders) / previous.totalOrders) * 100 : 0,
    ratingTrend: previous.customerRating > 0 ? 
      latest.customerRating - previous.customerRating : 0,
  };
};

const VendorAnalytics = mongoose.model('VendorAnalytics', vendorAnalyticsSchema);

export default VendorAnalytics;
