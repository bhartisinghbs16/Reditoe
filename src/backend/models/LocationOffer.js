/**
 * LocationOffer model for location-specific offers and promotions
 */
import mongoose from 'mongoose';

const locationOfferSchema = new mongoose.Schema({
  // Basic offer information
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  offerType: {
    type: String,
    enum: ['flat', 'percentage', 'free_delivery', 'buy_one_get_one'],
    required: true,
  },
  discountValue: {
    type: Number,
    required: function() {
      return this.offerType !== 'free_delivery';
    },
    min: 0,
  },
  maxDiscount: {
    type: Number,
    min: 0,
  },

  // Location targeting
  isGlobal: {
    type: Boolean,
    default: false,
  },
  targetCities: [{
    type: String,
    required: true,
    trim: true,
  }],
  targetAreas: [{
    type: String,
    trim: true,
  }],
  targetPostalCodes: [{
    type: String,
    trim: true,
  }],

  // Restaurant targeting
  applicableRestaurants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
  }],
  excludedRestaurants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
  }],
  applicableCategories: [{
    type: String,
    trim: true,
  }],

  // Order conditions
  minOrderValue: {
    type: Number,
    default: 0,
    min: 0,
  },
  maxOrderValue: {
    type: Number,
  },
  minOrderItems: {
    type: Number,
    default: 1,
    min: 1,
  },

  // Usage limits
  usageLimit: {
    type: Number,
    min: 1,
  },
  perUserLimit: {
    type: Number,
    min: 1,
  },
  dailyLimit: {
    type: Number,
    min: 1,
  },
  usedCount: {
    type: Number,
    default: 0,
  },
  dailyUsedCount: {
    type: Number,
    default: 0,
  },
  lastResetDate: {
    type: Date,
    default: Date.now,
  },

  // Time restrictions
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
    required: true,
  },
  validDays: [{
    type: String,
    enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  }],
  validHours: {
    start: {
      type: String,
      match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    end: {
      type: String,
      match: /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
  },

  // BOGO specific fields
  bogoDetails: {
    buyQuantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    getQuantity: {
      type: Number,
      default: 1,
      min: 1,
    },
    getDiscount: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    applicableCategories: [{
      type: String,
      trim: true,
    }],
  },

  // Free delivery specific fields
  freeDeliveryDetails: {
    minOrderValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxDeliveryDiscount: {
      type: Number,
    },
  },

  // Usage tracking
  redemptionHistory: [{
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
    },
    city: {
      type: String,
      trim: true,
    },
    area: {
      type: String,
      trim: true,
    },
    discountAmount: {
      type: Number,
      required: true,
    },
    redeemedAt: {
      type: Date,
      default: Date.now,
    },
  }],

  // Analytics
  totalRedemptions: {
    type: Number,
    default: 0,
  },
  totalDiscountGiven: {
    type: Number,
    default: 0,
  },
  uniqueUsers: {
    type: Number,
    default: 0,
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
}, {
  timestamps: true,
});

// Indexes for performance
locationOfferSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
locationOfferSchema.index({ targetCities: 1 });
locationOfferSchema.index({ applicableRestaurants: 1 });
locationOfferSchema.index({ 'redemptionHistory.city': 1 });

// Instance methods
locationOfferSchema.methods.isCurrentlyActive = function() {
  const now = new Date();
  
  // Check basic active status and date range
  if (!this.isActive || this.startDate > now || this.endDate < now) {
    return false;
  }

  // Check day of week
  if (this.validDays.length > 0) {
    const currentDay = now.toLocaleLowerCase().substring(0, 3);
    if (!this.validDays.includes(currentDay)) {
      return false;
    }
  }

  // Check time range
  if (this.validHours.start && this.validHours.end) {
    const currentTime = now.toTimeString().substring(0, 5);
    if (currentTime < this.validHours.start || currentTime > this.validHours.end) {
      return false;
    }
  }

  // Check daily limit
  if (this.dailyLimit && this.dailyUsedCount >= this.dailyLimit) {
    // Reset daily count if needed
    const today = new Date().toDateString();
    const lastReset = this.lastResetDate.toDateString();
    if (today !== lastReset) {
      this.dailyUsedCount = 0;
      this.lastResetDate = new Date();
    } else {
      return false;
    }
  }

  return true;
};

locationOfferSchema.methods.isApplicableToLocation = function(city, area = '') {
  if (this.isGlobal) return true;
  
  const cityMatch = this.targetCities.some(targetCity => 
    targetCity.toLowerCase() === city.toLowerCase()
  );
  
  if (!cityMatch) return false;
  
  if (this.targetAreas.length > 0 && area) {
    const areaMatch = this.targetAreas.some(targetArea => 
      targetArea.toLowerCase() === area.toLowerCase()
    );
    return areaMatch;
  }
  
  return true;
};

locationOfferSchema.methods.isApplicableToRestaurant = function(restaurantId, restaurantCategories = []) {
  // Check if restaurant is excluded
  if (this.excludedRestaurants.length > 0) {
    const isExcluded = this.excludedRestaurants.some(id => 
      id.toString() === restaurantId.toString()
    );
    if (isExcluded) return false;
  }

  // Check if restaurant is in applicable list
  if (this.applicableRestaurants.length > 0) {
    const isApplicable = this.applicableRestaurants.some(id => 
      id.toString() === restaurantId.toString()
    );
    if (!isApplicable) return false;
  }

  // Check categories
  if (this.applicableCategories.length > 0) {
    const categoryMatch = restaurantCategories.some(category => 
      this.applicableCategories.includes(category)
    );
    if (!categoryMatch) return false;
  }

  return true;
};

locationOfferSchema.methods.calculateDiscount = function(orderAmount, orderItems = [], userRedemptions = 0) {
  if (!this.isCurrentlyActive()) return 0;
  if (orderAmount < this.minOrderValue) return 0;
  if (this.maxOrderValue && orderAmount > this.maxOrderValue) return 0;
  if (orderItems.length < this.minOrderItems) return 0;
  if (this.perUserLimit && userRedemptions >= this.perUserLimit) return 0;
  if (this.usageLimit && this.usedCount >= this.usageLimit) return 0;

  let discount = 0;

  switch (this.offerType) {
    case 'flat':
      discount = Math.min(this.discountValue, orderAmount);
      break;
    case 'percentage':
      discount = (orderAmount * this.discountValue) / 100;
      if (this.maxDiscount) {
        discount = Math.min(discount, this.maxDiscount);
      }
      break;
    case 'free_delivery':
      discount = this.freeDeliveryDetails.maxDeliveryDiscount || 50; // Default delivery charge
      if (this.freeDeliveryDetails.minOrderValue && orderAmount < this.freeDeliveryDetails.minOrderValue) {
        discount = 0;
      }
      break;
    case 'buy_one_get_one':
      // BOGO logic would be implemented in order processing
      // For now, return estimated discount
      const applicableItems = orderItems.filter(item => 
        !this.bogoDetails.applicableCategories.length || 
        item.categories.some(cat => this.bogoDetails.applicableCategories.includes(cat))
      );
      const freeItems = Math.floor(applicableItems.length / this.bogoDetails.buyQuantity) * this.bogoDetails.getQuantity;
      // This is a simplified calculation
      discount = freeItems * 100; // Placeholder
      break;
  }

  return discount;
};

locationOfferSchema.methods.recordRedemption = function(orderId, userId, restaurantId, city, area, discountAmount) {
  this.redemptionHistory.push({
    orderId,
    userId,
    restaurantId,
    city,
    area,
    discountAmount,
    redeemedAt: new Date(),
  });
  
  this.usedCount += 1;
  this.dailyUsedCount += 1;
  this.totalRedemptions += 1;
  this.totalDiscountGiven += discountAmount;
  
  // Update unique users count
  const uniqueUserIds = new Set(this.redemptionHistory.map(r => r.userId.toString()));
  this.uniqueUsers = uniqueUserIds.size;
  
  return this.save();
};

locationOfferSchema.methods.getAnalytics = function(startDate, endDate) {
  let redemptions = this.redemptionHistory;
  
  if (startDate || endDate) {
    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();
    redemptions = redemptions.filter(r => r.redeemedAt >= start && r.redeemedAt <= end);
  }
  
  const cityStats = {};
  redemptions.forEach(r => {
    if (!cityStats[r.city]) {
      cityStats[r.city] = { count: 0, discount: 0 };
    }
    cityStats[r.city].count += 1;
    cityStats[r.city].discount += r.discountAmount;
  });
  
  return {
    totalRedemptions: redemptions.length,
    totalDiscount: redemptions.reduce((sum, r) => sum + r.discountAmount, 0),
    averageDiscount: redemptions.length > 0 ? redemptions.reduce((sum, r) => sum + r.discountAmount, 0) / redemptions.length : 0,
    cityStats,
    period: {
      startDate: startDate || this.createdAt,
      endDate: endDate || new Date(),
    },
  };
};

// Static methods
locationOfferSchema.statics.findActiveOffers = function(city, area = '', restaurantId = '', restaurantCategories = []) {
  const now = new Date();
  const query = {
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  };
  
  return this.find(query)
    .populate('applicableRestaurants', 'name')
    .populate('excludedRestaurants', 'name')
    .then(offers => {
      return offers.filter(offer => {
        if (!offer.isCurrentlyActive()) return false;
        if (!offer.isApplicableToLocation(city, area)) return false;
        if (restaurantId && !offer.isApplicableToRestaurant(restaurantId, restaurantCategories)) return false;
        return true;
      });
    });
};

locationOfferSchema.statics.getOffersByCity = function(city) {
  return this.find({
    isActive: true,
    targetCities: city,
    startDate: { $lte: new Date() },
    endDate: { $gte: new Date() },
  }).populate('applicableRestaurants', 'name');
};

locationOfferSchema.statics.getLocationOfferAnalytics = function(startDate, endDate) {
  return this.find({})
    .then(offers => {
      return offers.map(offer => ({
        id: offer._id,
        title: offer.title,
        offerType: offer.offerType,
        targetCities: offer.targetCities,
        isActive: offer.isCurrentlyActive(),
        analytics: offer.getAnalytics(startDate, endDate),
      }));
    });
};

const LocationOffer = mongoose.model('LocationOffer', locationOfferSchema);

export default LocationOffer;
