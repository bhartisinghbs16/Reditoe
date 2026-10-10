/**
 * Banner model for homepage and app banners management
 */
import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema({
  // Basic banner information
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  bannerType: {
    type: String,
    enum: ['image', 'carousel', 'video'],
    required: true,
  },

  // Media content
  mediaUrl: {
    type: String,
    required: true,
  },
  mediaType: {
    type: String,
    enum: ['image', 'video'],
    required: true,
  },
  altText: {
    type: String,
    trim: true,
  },

  // Carousel specific fields
  carouselItems: [{
    title: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    mediaUrl: {
      type: String,
      required: true,
    },
    mediaType: {
      type: String,
      enum: ['image', 'video'],
      required: true,
    },
    altText: {
      type: String,
      trim: true,
    },
    actionUrl: {
      type: String,
    },
    actionType: {
      type: String,
      enum: ['url', 'category', 'restaurant', 'offer'],
    },
    actionValue: {
      type: String,
    },
    order: {
      type: Number,
      default: 0,
    },
  }],

  // Call to action
  actionUrl: {
    type: String,
  },
  actionType: {
    type: String,
    enum: ['url', 'category', 'restaurant', 'offer', 'none'],
    default: 'none',
  },
  actionValue: {
    type: String,
  },
  buttonText: {
    type: String,
  },

  // Display settings
  position: {
    type: String,
    enum: ['homepage', 'category', 'restaurant', 'checkout'],
    default: 'homepage',
  },
  displayOrder: {
    type: Number,
    default: 0,
  },

  // Scheduling
  isActive: {
    type: Boolean,
    default: true,
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
  },

  // Targeting
  isGlobal: {
    type: Boolean,
    default: true,
  },
  targetCities: [{
    type: String,
    trim: true,
  }],
  targetAreas: [{
    type: String,
    trim: true,
  }],
  targetCategories: [{
    type: String,
    trim: true,
  }],
  targetRestaurants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
  }],
  targetUserTypes: [{
    type: String,
    enum: ['new', 'existing', 'premium'],
  }],

  // Device targeting
  targetPlatforms: [{
    type: String,
    enum: ['ios', 'android', 'web'],
  }],
  targetDeviceTypes: [{
    type: String,
    enum: ['mobile', 'tablet', 'desktop'],
  }],

  // Analytics tracking
  impressions: {
    type: Number,
    default: 0,
  },
  clicks: {
    type: Number,
    default: 0,
  },
  clickThroughRate: {
    type: Number,
    default: 0,
  },

  // Click tracking
  clickHistory: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    clickedAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    platform: {
      type: String,
    },
  }],

  // Impression tracking
  impressionHistory: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    viewedAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    platform: {
      type: String,
    },
  }],

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
}, {
  timestamps: true,
});

// Indexes for performance
bannerSchema.index({ isActive: 1, position: 1, displayOrder: 1 });
bannerSchema.index({ startDate: 1, endDate: 1 });
bannerSchema.index({ targetCities: 1 });
bannerSchema.index({ targetCategories: 1 });

// Instance methods
bannerSchema.methods.isCurrentlyActive = function() {
  const now = new Date();
  return this.isActive && 
         this.startDate <= now && 
         (!this.endDate || this.endDate >= now);
};

bannerSchema.methods.isTargetedToUser = function(userLocation = {}, userType = 'existing', platform = 'web') {
  if (!this.isCurrentlyActive()) return false;

  // Check platform targeting
  if (this.targetPlatforms.length && !this.targetPlatforms.includes(platform)) {
    return false;
  }

  // Check user type targeting
  if (this.targetUserTypes.length && !this.targetUserTypes.includes(userType)) {
    return false;
  }

  // Check location targeting
  if (!this.isGlobal) {
    if (this.targetCities.length && userLocation.city && 
        !this.targetCities.includes(userLocation.city)) {
      return false;
    }
    if (this.targetAreas.length && userLocation.area && 
        !this.targetAreas.includes(userLocation.area)) {
      return false;
    }
  }

  return true;
};

bannerSchema.methods.recordImpression = function(userId, ipAddress, userAgent, platform) {
  this.impressions += 1;
  this.impressionHistory.push({
    userId,
    ipAddress,
    userAgent,
    platform,
    viewedAt: new Date(),
  });
  
  // Update click-through rate
  if (this.impressions > 0) {
    this.clickThroughRate = (this.clicks / this.impressions) * 100;
  }
  
  return this.save();
};

bannerSchema.methods.recordClick = function(userId, ipAddress, userAgent, platform) {
  this.clicks += 1;
  this.clickHistory.push({
    userId,
    ipAddress,
    userAgent,
    platform,
    clickedAt: new Date(),
  });
  
  // Update click-through rate
  if (this.impressions > 0) {
    this.clickThroughRate = (this.clicks / this.impressions) * 100;
  }
  
  return this.save();
};

bannerSchema.methods.getAnalytics = function(startDate, endDate) {
  let impressions = this.impressionHistory;
  let clicks = this.clickHistory;
  
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    
    impressions = impressions.filter(i => i.viewedAt >= start && i.viewedAt <= end);
    clicks = clicks.filter(c => c.clickedAt >= start && c.clickedAt <= end);
  }
  
  const uniqueUsers = new Set([
    ...impressions.map(i => i.userId?.toString()).filter(Boolean),
    ...clicks.map(c => c.userId?.toString()).filter(Boolean)
  ]);
  
  return {
    impressions: impressions.length,
    clicks: clicks.length,
    clickThroughRate: impressions.length > 0 ? (clicks.length / impressions.length) * 100 : 0,
    uniqueUsers: uniqueUsers.size,
    period: {
      startDate: startDate || this.createdAt,
      endDate: endDate || new Date(),
    },
  };
};

// Static methods
bannerSchema.statics.findActiveBanners = function(filters = {}) {
  const now = new Date();
  const query = {
    isActive: true,
    startDate: { $lte: now },
    $or: [
      { endDate: { $exists: false } },
      { endDate: { $gte: now } }
    ],
    ...filters,
  };
  
  return this.find(query)
    .sort({ displayOrder: 1, createdAt: -1 })
    .populate('targetRestaurants', 'name');
};

bannerSchema.statics.findBannersByPosition = function(position, userLocation = {}, userType = 'existing', platform = 'web') {
  return this.findActiveBanners({ position })
    .then(banners => {
      return banners.filter(banner => banner.isTargetedToUser(userLocation, userType, platform));
    });
};

bannerSchema.statics.getBannerAnalytics = function(startDate, endDate) {
  return this.find({})
    .then(banners => {
      return banners.map(banner => ({
        id: banner._id,
        title: banner.title,
        position: banner.position,
        bannerType: banner.bannerType,
        isActive: banner.isCurrentlyActive(),
        analytics: banner.getAnalytics(startDate, endDate),
      }));
    });
};

const Banner = mongoose.model('Banner', bannerSchema);

export default Banner;
