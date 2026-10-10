/**
 * Advanced Analytics model for deep BI insights
 * Additive only - does not modify existing analytics
 */
import mongoose from 'mongoose';

const analyticsPeriodSchema = new mongoose.Schema({
  period: {
    type: String,
    enum: ['hourly', 'daily', 'weekly', 'monthly'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  data: [{
    timestamp: {
      type: Date,
      required: true
    },
    metrics: {
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      users: { type: Number, default: 0 },
      vendors: { type: Number, default: 0 },
      riders: { type: Number, default: 0 },
      averageOrderValue: { type: Number, default: 0 },
      commission: { type: Number, default: 0 },
      discounts: { type: Number, default: 0 }
    }
  }]
}, { _id: false });

const profitBreakdownSchema = new mongoose.Schema({
  totalRevenue: { type: Number, default: 0 },
  commissionRevenue: { type: Number, default: 0 },
  deliveryRevenue: { type: Number, default: 0 },
  otherRevenue: { type: Number, default: 0 },
  totalCosts: { type: Number, default: 0 },
  riderPayouts: { type: Number, default: 0 },
  operationalCosts: { type: Number, default: 0 },
  marketingCosts: { type: Number, default: 0 },
  netProfit: { type: Number, default: 0 },
  profitMargin: { type: Number, default: 0 },
  breakdown: [{
    category: {
      type: String,
      enum: ['commission', 'delivery', 'marketing', 'operations', 'support', 'technology']
    },
    amount: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 }
  }]
}, { _id: false });

const geographicHeatmapSchema = new mongoose.Schema({
  coordinates: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true }
  },
  location: {
    city: String,
    area: String,
    address: String
  },
  intensity: {
    orders: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 },
    users: { type: Number, default: 0 },
    density: { type: Number, default: 0 }
  },
  timeData: [{
    hour: { type: Number, min: 0, max: 23 },
    orders: { type: Number, default: 0 },
    revenue: { type: Number, default: 0 }
  }]
}, { _id: false });

const vendorPerformanceSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true
  },
  vendorName: String,
  metrics: {
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 },
    averagePreparationTime: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    cancellationRate: { type: Number, default: 0 },
    commissionGenerated: { type: Number, default: 0 },
    topSellingItems: [{
      itemName: String,
      quantity: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }]
  },
  trends: {
    growthRate: { type: Number, default: 0 },
    revenueGrowth: { type: Number, default: 0 },
    orderGrowth: { type: Number, default: 0 }
  }
}, { _id: false });

const userBehaviorSchema = new mongoose.Schema({
  totalUsers: { type: Number, default: 0 },
  activeUsers: { type: Number, default: 0 },
  newUsers: { type: Number, default: 0 },
  returningUsers: { type: Number, default: 0 },
  userSegments: [{
    segment: {
      type: String,
      enum: ['new', 'active', 'inactive', 'churned', 'premium']
    },
    count: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 }
  }],
  behaviorMetrics: {
    averageOrdersPerUser: { type: Number, default: 0 },
    averageSessionDuration: { type: Number, default: 0 },
    retentionRate: { type: Number, default: 0 },
    churnRate: { type: Number, default: 0 }
  },
  deviceUsage: [{
    platform: {
      type: String,
      enum: ['ios', 'android', 'web']
    },
    users: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    averageOrders: { type: Number, default: 0 }
  }]
}, { _id: false });

const advancedAnalyticsSchema = new mongoose.Schema({
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  
  // Analysis period
  period: {
    type: String,
    enum: ['hourly', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },

  // Core analytics data
  overview: {
    totalOrders: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalUsers: { type: Number, default: 0 },
    totalVendors: { type: Number, default: 0 },
    totalRiders: { type: Number, default: 0 },
    averageOrderValue: { type: Number, default: 0 },
    growthRates: {
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      users: { type: Number, default: 0 },
      vendors: { type: Number, default: 0 }
    }
  },

  // Trend analysis
  trends: analyticsPeriodSchema,

  // Profit analysis
  profitBreakdown: profitBreakdownSchema,

  // Geographic heatmaps
  geographicHeatmaps: [geographicHeatmapSchema],

  // Vendor performance
  topVendors: [vendorPerformanceSchema],
  vendorMetrics: {
    totalActive: { type: Number, default: 0 },
    totalInactive: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    averageCommission: { type: Number, default: 0 }
  },

  // User behavior analytics
  userBehavior: userBehaviorSchema,

  // Product analytics
  productAnalytics: {
    topCategories: [{
      categoryName: String,
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      growth: { type: Number, default: 0 }
    }],
    topItems: [{
      itemName: String,
      restaurantName: String,
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 },
      growth: { type: Number, default: 0 }
    }]
  },

  // Time-based patterns
  timePatterns: {
    peakHours: [{
      hour: { type: Number, min: 0, max: 23 },
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }],
    peakDays: [{
      day: { type: Number, min: 1, max: 7 },
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }],
    seasonalTrends: [{
      month: { type: Number, min: 1, max: 12 },
      orders: { type: Number, default: 0 },
      revenue: { type: Number, default: 0 }
    }]
  },

  // Predictive analytics
  predictions: {
    nextPeriodRevenue: { type: Number, default: 0 },
    nextPeriodOrders: { type: Number, default: 0 },
    confidence: { type: Number, default: 0 },
    factors: [{
      factor: String,
      impact: { type: Number, default: 0 },
      weight: { type: Number, default: 0 }
    }]
  },

  // Metadata
  generatedAt: {
    type: Date,
    default: Date.now
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  dataQuality: {
    completeness: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    freshness: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes for performance
advancedAnalyticsSchema.index({ organizationId: 1, period: 1, startDate: -1 });
advancedAnalyticsSchema.index({ startDate: 1, endDate: 1 });
advancedAnalyticsSchema.index({ generatedAt: -1 });

// Static methods
advancedAnalyticsSchema.statics.generateAnalytics = async function(organizationId, period, startDate, endDate) {
  // This would implement the actual analytics generation logic
  // For now, return a placeholder
  const analytics = new this({
    organizationId,
    period,
    startDate,
    endDate,
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
};

advancedAnalyticsSchema.statics.getLatestAnalytics = function(organizationId, period) {
  return this.findOne({ organizationId, period })
    .sort({ generatedAt: -1 })
    .populate('topVendors.vendorId', 'name email')
    .populate('generatedBy', 'name email');
};

const AdvancedAnalytics = mongoose.model('AdvancedAnalytics', advancedAnalyticsSchema);

export default AdvancedAnalytics;
