/**
 * Campaign model for marketing campaigns
 * Supports push notifications, banners, and multi-channel campaigns
 */
import mongoose from 'mongoose';

const campaignSchema = new mongoose.Schema({
  // Basic campaign info
  name: {
    type: String,
    required: [true, 'Campaign name is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  campaignType: {
    type: String,
    enum: ['PUSH_NOTIFICATION', 'BANNER', 'EMAIL', 'MULTI_CHANNEL'],
    required: true,
  },

  // Campaign content
  content: {
    title: {
      type: String,
      required: function() { return this.campaignType === 'PUSH_NOTIFICATION'; }
    },
    message: {
      type: String,
      required: function() { return this.campaignType === 'PUSH_NOTIFICATION'; }
    },
    imageUrl: String,
    actionUrl: String,
    actionText: String,
  },

  // Targeting rules
  targeting: {
    userRoles: [{
      type: String,
      enum: ['CUSTOMER', 'VENDOR', 'RIDER', 'ADMIN'],
    }],
    cities: [String],
    areas: [String],
    ageGroups: [{
      type: String,
      enum: ['18-24', '25-34', '35-44', '45-54', '55+'],
    }],
    genders: [{
      type: String,
      enum: ['male', 'female', 'other'],
    }],
    userTypes: [{
      type: String,
      enum: ['new', 'existing', 'premium', 'inactive'],
    }],
    orderHistory: {
      minOrders: Number,
      maxOrders: Number,
      lastOrderDays: Number,
    },
    spendingHistory: {
      minSpent: Number,
      maxSpent: Number,
    },
    specificUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
    excludeUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    }],
  },

  // Scheduling
  schedule: {
    type: {
      type: String,
      enum: ['IMMEDIATE', 'SCHEDULED', 'RECURRING'],
      default: 'IMMEDIATE',
    },
    scheduledAt: Date,
    timezone: {
      type: String,
      default: 'UTC',
    },
    recurringPattern: {
      frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly'],
      },
      interval: Number,
      daysOfWeek: [Number], // 0-6 (Sunday-Saturday)
      dayOfMonth: Number,
      endDate: Date,
    },
  },

  // Campaign status
  status: {
    type: String,
    enum: ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'],
    default: 'DRAFT',
  },
  
  // Performance tracking
  metrics: {
    targetCount: {
      type: Number,
      default: 0,
    },
    sentCount: {
      type: Number,
      default: 0,
    },
    deliveredCount: {
      type: Number,
      default: 0,
    },
    failedCount: {
      type: Number,
      default: 0,
    },
    openCount: {
      type: Number,
      default: 0,
    },
    clickCount: {
      type: Number,
      default: 0,
    },
    conversionCount: {
      type: Number,
      default: 0,
    },
    revenueGenerated: {
      type: Number,
      default: 0,
    },
  },

  // Delivery tracking
  deliveryLogs: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'DELIVERED', 'FAILED', 'OPENED', 'CLICKED'],
      default: 'PENDING',
    },
    sentAt: Date,
    deliveredAt: Date,
    openedAt: Date,
    clickedAt: Date,
    errorMessage: String,
    retryCount: {
      type: Number,
      default: 0,
    },
  }],

  // A/B testing
  abTest: {
    enabled: {
      type: Boolean,
      default: false,
    },
    variants: [{
      name: String,
      content: {
        title: String,
        message: String,
        imageUrl: String,
        actionUrl: String,
      },
      trafficSplit: {
        type: Number,
        default: 50, // percentage
      },
      metrics: {
        sentCount: { type: Number, default: 0 },
        openCount: { type: Number, default: 0 },
        clickCount: { type: Number, default: 0 },
        conversionCount: { type: Number, default: 0 },
      },
    }],
  },

  // Budget and limits
  budget: {
    total: Number,
    spent: {
      type: Number,
      default: 0,
    },
    costPerSend: {
      type: Number,
      default: 0,
    },
  },

  // Audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  activatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  activatedAt: Date,
  completedAt: Date,
}, {
  timestamps: true,
});

// Indexes
campaignSchema.index({ campaignType: 1, status: 1 });
campaignSchema.index({ 'schedule.scheduledAt': 1, status: 1 });
campaignSchema.index({ createdBy: 1 });
campaignSchema.index({ 'targeting.cities': 1 });
campaignSchema.index({ 'deliveryLogs.status': 1 });

// Instance methods
campaignSchema.methods.calculateTargetUsers = async function() {
  const User = mongoose.model('User');
  const Order = mongoose.model('Order');
  
  let query = { isActive: true };
  
  // Role targeting
  if (this.targeting.userRoles && this.targeting.userRoles.length > 0) {
    query.role = { $in: this.targeting.userRoles };
  }
  
  // Geographic targeting
  if (this.targeting.cities && this.targeting.cities.length > 0) {
    query['address.city'] = { $in: this.targeting.cities };
  }
  
  // Exclude specific users
  if (this.targeting.excludeUsers && this.targeting.excludeUsers.length > 0) {
    query._id = { $nin: this.targeting.excludeUsers };
  }
  
  // Specific users override all other targeting
  if (this.targeting.specificUsers && this.targeting.specificUsers.length > 0) {
    query._id = { $in: this.targeting.specificUsers };
  }
  
  const users = await User.find(query).select('_id');
  return users;
};

campaignSchema.methods.sendNotification = async function() {
  const User = mongoose.model('User');
  const targetUsers = await this.calculateTargetUsers();
  
  this.metrics.targetCount = targetUsers.length;
  
  // Create delivery logs for each user
  const deliveryLogs = targetUsers.map(user => ({
    userId: user._id,
    status: 'PENDING',
    retryCount: 0,
  }));
  
  this.deliveryLogs.push(...deliveryLogs);
  await this.save();
  
  return targetUsers;
};

campaignSchema.methods.updateDeliveryStatus = async function(userId, status, metadata = {}) {
  const log = this.deliveryLogs.find(log => 
    log.userId.toString() === userId.toString()
  );
  
  if (log) {
    log.status = status;
    
    if (status === 'SENT') {
      log.sentAt = new Date();
      this.metrics.sentCount += 1;
    } else if (status === 'DELIVERED') {
      log.deliveredAt = new Date();
      this.metrics.deliveredCount += 1;
    } else if (status === 'OPENED') {
      log.openedAt = new Date();
      this.metrics.openCount += 1;
    } else if (status === 'CLICKED') {
      log.clickedAt = new Date();
      this.metrics.clickCount += 1;
    } else if (status === 'FAILED') {
      log.errorMessage = metadata.errorMessage;
      log.retryCount += 1;
      this.metrics.failedCount += 1;
    }
    
    await this.save();
  }
};

campaignSchema.methods.getPerformanceMetrics = function() {
  const metrics = this.metrics;
  
  return {
    ...metrics,
    deliveryRate: metrics.targetCount > 0 ? (metrics.deliveredCount / metrics.targetCount) * 100 : 0,
    openRate: metrics.deliveredCount > 0 ? (metrics.openCount / metrics.deliveredCount) * 100 : 0,
    clickRate: metrics.openCount > 0 ? (metrics.clickCount / metrics.openCount) * 100 : 0,
    conversionRate: metrics.clickCount > 0 ? (metrics.conversionCount / metrics.clickCount) * 100 : 0,
    costPerConversion: metrics.conversionCount > 0 ? (this.budget?.spent || 0) / metrics.conversionCount : 0,
    revenuePerSend: metrics.sentCount > 0 ? metrics.revenueGenerated / metrics.sentCount : 0,
  };
};

// Static methods
campaignSchema.statics.findScheduledCampaigns = function() {
  const now = new Date();
  return this.find({
    status: 'SCHEDULED',
    'schedule.scheduledAt': { $lte: now },
  });
};

campaignSchema.statics.findActiveCampaigns = function() {
  return this.find({
    status: 'ACTIVE',
  });
};

campaignSchema.statics.getCampaignAnalytics = async function(startDate, endDate) {
  const matchStage = {};
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = startDate;
    if (endDate) matchStage.createdAt.$lte = endDate;
  }
  
  const analytics = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$campaignType',
        totalCampaigns: { $sum: 1 },
        activeCampaigns: {
          $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] }
        },
        totalTargeted: { $sum: '$metrics.targetCount' },
        totalSent: { $sum: '$metrics.sentCount' },
        totalDelivered: { $sum: '$metrics.deliveredCount' },
        totalOpened: { $sum: '$metrics.openCount' },
        totalClicked: { $sum: '$metrics.clickCount' },
        totalConversions: { $sum: '$metrics.conversionCount' },
        totalRevenue: { $sum: '$metrics.revenueGenerated' },
      }
    }
  ]);
  
  return analytics;
};

const Campaign = mongoose.model('Campaign', campaignSchema);

export default Campaign;
