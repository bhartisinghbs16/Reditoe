import mongoose from 'mongoose';

const userAnalyticsSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true,
  },
  totalUsers: {
    type: Number,
    required: true,
    min: 0,
  },
  activeUsers: {
    type: Number,
    required: true,
    min: 0,
  },
  newUsers: {
    type: Number,
    required: true,
    min: 0,
  },
  returningUsers: {
    type: Number,
    required: true,
    min: 0,
  },
  userRetentionRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  averageSessionDuration: {
    type: Number,
    required: true,
    min: 0, // in minutes
  },
  userEngagementScore: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
  },
  deviceBreakdown: {
    mobile: {
      users: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
    },
    desktop: {
      users: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
    },
    tablet: {
      users: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
    },
    api: {
      users: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
    },
  },
  userActivityMetrics: {
    logins: { type: Number, default: 0 },
    logouts: { type: Number, default: 0 },
    ordersPlaced: { type: Number, default: 0 },
    ordersCompleted: { type: Number, default: 0 },
    paymentsSuccessful: { type: Number, default: 0 },
    paymentsFailed: { type: Number, default: 0 },
    profileUpdates: { type: Number, default: 0 },
    supportTickets: { type: Number, default: 0 },
    reviewsSubmitted: { type: Number, default: 0 },
    walletTransactions: { type: Number, default: 0 },
  },
  userSegmentMetrics: {
    newUsers: {
      count: { type: Number, default: 0 },
      averageOrders: { type: Number, default: 0 },
      averageSpent: { type: Number, default: 0 },
    },
    activeUsers: {
      count: { type: Number, default: 0 },
      averageOrders: { type: Number, default: 0 },
      averageSpent: { type: Number, default: 0 },
    },
    inactiveUsers: {
      count: { type: Number, default: 0 },
      lastActiveDays: { type: Number, default: 0 },
    },
    vipUsers: {
      count: { type: Number, default: 0 },
      averageOrders: { type: Number, default: 0 },
      averageSpent: { type: Number, default: 0 },
    },
  },
  geographicMetrics: {
    topCities: [{
      city: String,
      userCount: Number,
      percentage: Number,
    }],
    topRegions: [{
      region: String,
      userCount: Number,
      percentage: Number,
    }],
    topCountries: [{
      country: String,
      userCount: Number,
      percentage: Number,
    }],
  },
  timeBasedMetrics: {
    peakHours: [{
      hour: Number,
      userCount: Number,
      activityType: String,
    }],
    peakDays: [{
      day: String,
      userCount: Number,
      activityType: String,
    }],
    averageOrdersPerHour: { type: Number, default: 0 },
    averageLoginsPerHour: { type: Number, default: 0 },
  },
  conversionMetrics: {
    registrationToOrder: {
      percentage: Number,
      count: Number,
    },
    orderToRepeat: {
      percentage: Number,
      count: Number,
    },
    userToVIP: {
      percentage: Number,
      count: Number,
    },
  },
  retentionMetrics: {
    day1: { type: Number, default: 0 },    // % users active on day 1
    day7: { type: Number, default: 0 },    // % users active on day 7
    day30: { type: Number, default: 0 },   // % users active on day 30
    day90: { type: Number, default: 0 },   // % users active on day 90
    churnRate: { type: Number, default: 0 }, // Monthly churn rate
  },
  revenueMetrics: {
    averageRevenuePerUser: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    revenueFromNewUsers: { type: Number, default: 0 },
    revenueFromReturningUsers: { type: Number, default: 0 },
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes for efficient queries
userAnalyticsSchema.index({ date: -1 });
userAnalyticsSchema.index({ 'deviceBreakdown.mobile.users': -1 });
userAnalyticsSchema.index({ 'userActivityMetrics.logins': -1 });
userAnalyticsSchema.index({ 'userSegmentMetrics.activeUsers.count': -1 });

// Compound index for dashboard queries
userAnalyticsSchema.index({ 
  date: -1, 
  organizationId: 1 
});

// Ensure one record per date per organization
userAnalyticsSchema.index({ 
  date: 1, 
  organizationId: 1 
}, { 
  unique: true,
  sparse: true 
});

const UserAnalytics = mongoose.model('UserAnalytics', userAnalyticsSchema);

export default UserAnalytics;
