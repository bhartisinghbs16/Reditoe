/**
 * CampaignAnalytics model for tracking marketing campaign performance
 */
import mongoose from 'mongoose';

const campaignAnalyticsSchema = new mongoose.Schema({
  // Campaign identification
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'campaignType',
  },
  campaignType: {
    type: String,
    enum: ['Coupon', 'Banner', 'LocationOffer', 'Referral'],
    required: true,
  },
  campaignName: {
    type: String,
    required: true,
  },

  // Analytics period
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },

  // Performance metrics
  metrics: {
    // Basic metrics
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    conversions: {
      type: Number,
      default: 0,
    },
    redemptions: {
      type: Number,
      default: 0,
    },

    // Calculated metrics
    clickThroughRate: {
      type: Number,
      default: 0,
    },
    conversionRate: {
      type: Number,
      default: 0,
    },
    redemptionRate: {
      type: Number,
      default: 0,
    },

    // Financial metrics
    totalDiscount: {
      type: Number,
      default: 0,
    },
    averageDiscount: {
      type: Number,
      default: 0,
    },
    costPerAcquisition: {
      type: Number,
      default: 0,
    },
    returnOnInvestment: {
      type: Number,
      default: 0,
    },

    // User metrics
    uniqueUsers: {
      type: Number,
      default: 0,
    },
    newUsers: {
      type: Number,
      default: 0,
    },
    returningUsers: {
      type: Number,
      default: 0,
    },
  },

  // Geographic breakdown
  geographicBreakdown: [{
    city: {
      type: String,
      required: true,
    },
    area: {
      type: String,
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    conversions: {
      type: Number,
      default: 0,
    },
    redemptions: {
      type: Number,
      default: 0,
    },
    totalDiscount: {
      type: Number,
      default: 0,
    },
  }],

  // Time-based breakdown
  timeBreakdown: [{
    date: {
      type: Date,
      required: true,
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    conversions: {
      type: Number,
      default: 0,
    },
    redemptions: {
      type: Number,
      default: 0,
    },
    totalDiscount: {
      type: Number,
      default: 0,
    },
    uniqueUsers: {
      type: Number,
      default: 0,
    },
  }],

  // Device breakdown
  deviceBreakdown: [{
    platform: {
      type: String,
      enum: ['ios', 'android', 'web'],
      required: true,
    },
    deviceType: {
      type: String,
      enum: ['mobile', 'tablet', 'desktop'],
    },
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    conversions: {
      type: Number,
      default: 0,
    },
    redemptions: {
      type: Number,
      default: 0,
    },
    totalDiscount: {
      type: Number,
      default: 0,
    },
  }],

  // User demographics
  userDemographics: {
    ageGroups: [{
      group: {
        type: String,
        enum: ['18-24', '25-34', '35-44', '45-54', '55+'],
      },
      count: {
        type: Number,
        default: 0,
      },
      conversions: {
        type: Number,
        default: 0,
      },
    }],
    genders: [{
      gender: {
        type: String,
        enum: ['male', 'female', 'other'],
      },
      count: {
        type: Number,
        default: 0,
      },
      conversions: {
        type: Number,
        default: 0,
      },
    }],
    userTypes: [{
      type: {
        type: String,
        enum: ['new', 'existing', 'premium'],
      },
      count: {
        type: Number,
        default: 0,
      },
      conversions: {
        type: Number,
        default: 0,
      },
    }],
  },

  // Top performing items
  topPerformingItems: [{
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodItem',
    },
    itemName: {
      type: String,
    },
    conversions: {
      type: Number,
      default: 0,
    },
    revenue: {
      type: Number,
      default: 0,
    },
  }],

  // Top performing restaurants
  topPerformingRestaurants: [{
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
    },
    restaurantName: {
      type: String,
    },
    conversions: {
      type: Number,
      default: 0,
    },
    revenue: {
      type: Number,
      default: 0,
    },
    redemptions: {
      type: Number,
      default: 0,
    },
  }],

  // Comparison metrics
  comparisonMetrics: {
    previousPeriod: {
      impressions: {
        type: Number,
        default: 0,
      },
      clicks: {
        type: Number,
        default: 0,
      },
      conversions: {
        type: Number,
        default: 0,
      },
      redemptions: {
        type: Number,
        default: 0,
      },
    },
    growthRates: {
      impressions: {
        type: Number,
        default: 0,
      },
      clicks: {
        type: Number,
        default: 0,
      },
      conversions: {
        type: Number,
        default: 0,
      },
      redemptions: {
        type: Number,
        default: 0,
      },
    },
  },

  // Goals and targets
  targets: {
    impressions: {
      type: Number,
    },
    clicks: {
      type: Number,
    },
    conversions: {
      type: Number,
    },
    redemptions: {
      type: Number,
    },
    roi: {
      type: Number,
    },
  },
  achievementRates: {
    impressions: {
      type: Number,
      default: 0,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    conversions: {
      type: Number,
      default: 0,
    },
    redemptions: {
      type: Number,
      default: 0,
    },
    roi: {
      type: Number,
      default: 0,
    },
  },

  // Audit trail
  generatedAt: {
    type: Date,
    default: Date.now,
  },
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Indexes for performance
campaignAnalyticsSchema.index({ campaignId: 1, campaignType: 1 });
campaignAnalyticsSchema.index({ startDate: 1, endDate: 1 });
campaignAnalyticsSchema.index({ campaignType: 1 });

// Instance methods
campaignAnalyticsSchema.methods.calculateMetrics = function() {
  // Calculate rates
  if (this.metrics.impressions > 0) {
    this.metrics.clickThroughRate = (this.metrics.clicks / this.metrics.impressions) * 100;
    this.metrics.conversionRate = (this.metrics.conversions / this.metrics.impressions) * 100;
    this.metrics.redemptionRate = (this.metrics.redemptions / this.metrics.impressions) * 100;
  }

  if (this.metrics.conversions > 0) {
    this.metrics.costPerAcquisition = this.metrics.totalDiscount / this.metrics.conversions;
  }

  if (this.metrics.totalDiscount > 0) {
    this.metrics.averageDiscount = this.metrics.totalDiscount / this.metrics.redemptions;
  }

  // Calculate achievement rates
  if (this.targets.impressions) {
    this.achievementRates.impressions = (this.metrics.impressions / this.targets.impressions) * 100;
  }
  if (this.targets.clicks) {
    this.achievementRates.clicks = (this.metrics.clicks / this.targets.clicks) * 100;
  }
  if (this.targets.conversions) {
    this.achievementRates.conversions = (this.metrics.conversions / this.targets.conversions) * 100;
  }
  if (this.targets.redemptions) {
    this.achievementRates.redemptions = (this.metrics.redemptions / this.targets.redemptions) * 100;
  }

  return this;
};

campaignAnalyticsSchema.methods.addTimeBreakdownEntry = function(date, metrics) {
  const existingEntry = this.timeBreakdown.find(entry => 
    entry.date.toDateString() === date.toDateString()
  );

  if (existingEntry) {
    Object.keys(metrics).forEach(key => {
      existingEntry[key] += metrics[key];
    });
  } else {
    this.timeBreakdown.push({
      date,
      ...metrics,
    });
  }

  return this;
};

campaignAnalyticsSchema.methods.addGeographicBreakdownEntry = function(city, area, metrics) {
  const existingEntry = this.geographicBreakdown.find(entry => 
    entry.city === city && entry.area === area
  );

  if (existingEntry) {
    Object.keys(metrics).forEach(key => {
      existingEntry[key] += metrics[key];
    });
  } else {
    this.geographicBreakdown.push({
      city,
      area,
      ...metrics,
    });
  }

  return this;
};

campaignAnalyticsSchema.methods.addDeviceBreakdownEntry = function(platform, deviceType, metrics) {
  const existingEntry = this.deviceBreakdown.find(entry => 
    entry.platform === platform && entry.deviceType === deviceType
  );

  if (existingEntry) {
    Object.keys(metrics).forEach(key => {
      existingEntry[key] += metrics[key];
    });
  } else {
    this.deviceBreakdown.push({
      platform,
      deviceType,
      ...metrics,
    });
  }

  return this;
};

// Static methods
campaignAnalyticsSchema.statics.generateCampaignAnalytics = async function(campaignId, campaignType, startDate, endDate) {
  // This would be implemented based on the specific campaign type
  // For now, return a placeholder
  const analytics = new this({
    campaignId,
    campaignType,
    campaignName: `${campaignType} Campaign`,
    startDate,
    endDate,
  });

  return analytics.calculateMetrics().save();
};

campaignAnalyticsSchema.statics.getCampaignAnalytics = function(campaignId, campaignType) {
  return this.findOne({ campaignId, campaignType })
    .populate('topPerformingItems.itemId', 'name price')
    .populate('topPerformingRestaurants.restaurantId', 'name');
};

campaignAnalyticsSchema.statics.getAllCampaignAnalytics = function(startDate, endDate) {
  const query = {};
  if (startDate || endDate) {
    query.startDate = { $gte: startDate || new Date(0) };
    query.endDate = { $lte: endDate || new Date() };
  }

  return this.find(query)
    .populate('campaignId')
    .sort({ generatedAt: -1 });
};

campaignAnalyticsSchema.statics.getComparisonAnalytics = function(campaignId, campaignType, currentPeriod, previousPeriod) {
  return Promise.all([
    this.findOne({ campaignId, campaignType, startDate: currentPeriod.start, endDate: currentPeriod.end }),
    this.findOne({ campaignId, campaignType, startDate: previousPeriod.start, endDate: previousPeriod.end }),
  ]).then(([current, previous]) => {
    if (!current) return null;

    const comparison = {
      current: current.metrics,
      previous: previous ? previous.metrics : {},
      growth: {},
    };

    Object.keys(current.metrics).forEach(metric => {
      const currentValue = current.metrics[metric];
      const previousValue = previous ? previous.metrics[metric] : 0;
      
      if (previousValue > 0) {
        comparison.growth[metric] = ((currentValue - previousValue) / previousValue) * 100;
      } else {
        comparison.growth[metric] = currentValue > 0 ? 100 : 0;
      }
    });

    return comparison;
  });
};

campaignAnalyticsSchema.statics.exportAnalytics = function(campaignIds, format = 'csv') {
  return this.find({ campaignId: { $in: campaignIds } })
    .then(analytics => {
      if (format === 'csv') {
        // Convert to CSV format
        const headers = ['Campaign Name', 'Type', 'Impressions', 'Clicks', 'Conversions', 'Redemptions', 'CTR', 'CR', 'Total Discount'];
        const rows = analytics.map(a => [
          a.campaignName,
          a.campaignType,
          a.metrics.impressions,
          a.metrics.clicks,
          a.metrics.conversions,
          a.metrics.redemptions,
          a.metrics.clickThroughRate.toFixed(2),
          a.metrics.conversionRate.toFixed(2),
          a.metrics.totalDiscount.toFixed(2),
        ]);

        return [headers, ...rows];
      } else if (format === 'excel') {
        // Return data for Excel processing
        return analytics.map(a => ({
          campaignName: a.campaignName,
          campaignType: a.campaignType,
          ...a.metrics,
          geographicBreakdown: a.geographicBreakdown,
          timeBreakdown: a.timeBreakdown,
          deviceBreakdown: a.deviceBreakdown,
        }));
      }
    });
};

const CampaignAnalytics = mongoose.model('CampaignAnalytics', campaignAnalyticsSchema);

export default CampaignAnalytics;
