/**
 * Coupon model for marketing campaigns and discounts
 */
import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  // Basic coupon information
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },

  // Coupon type and discount details
  type: {
    type: String,
    enum: ['flat', 'percentage', 'bogo'],
    required: true,
  },
  discountValue: {
    type: Number,
    required: function() {
      return this.type !== 'bogo';
    },
    min: 0,
  },
  maxDiscount: {
    type: Number,
    min: 0,
  },
  minOrderValue: {
    type: Number,
    default: 0,
    min: 0,
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
      default: 100, // percentage discount on free item
      min: 0,
      max: 100,
    },
  },

  // Usage limits and restrictions
  usageLimit: {
    type: Number,
    min: 1,
  },
  perUserLimit: {
    type: Number,
    min: 1,
  },
  usedCount: {
    type: Number,
    default: 0,
  },

  // Validity dates
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
    required: true,
  },

  // Applicability
  isGlobal: {
    type: Boolean,
    default: true,
  },
  applicableRestaurants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
  }],
  userType: {
    type: String,
    enum: ['all', 'new_user', 'regular'],
    default: 'all',
  },
  applicableCategories: [{
    type: String,
    trim: true,
  }],
  applicableFoodItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FoodItem',
  }],

  // Location restrictions
  applicableCities: [{
    type: String,
    trim: true,
  }],
  applicableAreas: [{
    type: String,
    trim: true,
  }],

  // Status and visibility
  isActive: {
    type: Boolean,
    default: true,
  },
  isPublic: {
    type: Boolean,
    default: true,
  },

  // Analytics tracking
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
    discountAmount: {
      type: Number,
      required: true,
    },
    redeemedAt: {
      type: Date,
      default: Date.now,
    },
  }],

  /**
   * Whose money the discount comes out of.
   *
   * A promotion a vendor runs is theirs to pay for and is deducted from their
   * payout. One the platform runs is the platform's, and must not be - the
   * vendor sold the food at full price and is owed for it. Without this
   * distinction every discount was quietly taken from whoever happened to be
   * settling that week.
   *
   * Recorded on the coupon rather than worked out from who created it,
   * because an admin can create a promotion a vendor has agreed to fund.
   */
  fundedBy: {
    type: String,
    enum: ['vendor', 'platform'],
    default: 'platform',
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
couponSchema.index({ isActive: 1, isPublic: 1 });
couponSchema.index({ startDate: 1, endDate: 1 });

// Drop problematic parallel array indexes if they exist
const dropParallelIndex = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      const collection = mongoose.connection.collection('coupons');
      const indexes = await collection.indexes();
      const arrayIndexFields = [
        'applicableAreas',
        'applicableCities',
        'applicableRestaurants',
        'applicableFoodItems',
        'applicableCategories',
      ];

      const arrayIndexes = indexes.filter(idx =>
        idx.key && arrayIndexFields.some(field => idx.key[field] !== undefined)
      );

      for (const index of arrayIndexes) {
        if (index.name) {
          await collection.dropIndex(index.name);
          console.log(`Dropped ${index.name} index`);
        }
      }
    }
  } catch (err) {
    console.log('Index drop skipped:', err.message);
  }
};

if (typeof couponSchema.on === 'function') {
  couponSchema.on('index', function(err) {
    if (err) console.log('Coupon index error:', err.message);
  });
}

mongoose.connection.once('open', dropParallelIndex);

// Instance methods
couponSchema.methods.isValid = function() {
  const now = new Date();
  return this.isActive && 
         this.startDate <= now && 
         this.endDate >= now &&
         (!this.usageLimit || this.usedCount < this.usageLimit);
};

couponSchema.methods.canUserUse = function(userId, usedCount = 0) {
  if (!this.isValid()) return false;
  if (this.perUserLimit && usedCount >= this.perUserLimit) return false;
  return true;
};

couponSchema.methods.calculateDiscount = function(orderAmount, orderItems = []) {
  if (!this.isValid()) return 0;

  // Check minimum order value
  if (orderAmount < this.minOrderValue) return 0;

  let discount = 0;

  switch (this.type) {
    case 'flat':
      discount = Math.min(this.discountValue, orderAmount);
      break;
    case 'percentage':
      discount = (orderAmount * this.discountValue) / 100;
      if (this.maxDiscount) {
        discount = Math.min(discount, this.maxDiscount);
      }
      break;
    case 'bogo':
      // BOGO logic would be implemented in order processing
      // For now, return estimated discount
      const applicableItems = orderItems.filter(item => 
        !this.applicableFoodItems.length || 
        this.applicableFoodItems.includes(item.foodItemId)
      );
      const freeItems = Math.floor(applicableItems.length / this.bogoDetails.buyQuantity) * this.bogoDetails.getQuantity;
      // This is a simplified calculation
      discount = freeItems * 100; // Placeholder
      break;
  }

  return discount;
};

couponSchema.methods.recordRedemption = function(orderId, userId, restaurantId, discountAmount) {
  this.redemptionHistory.push({
    orderId,
    userId,
    restaurantId,
    discountAmount,
    redeemedAt: new Date(),
  });
  this.usedCount += 1;
  return this.save();
};

// Static methods
couponSchema.statics.findValidCoupons = function(filters = {}) {
  const now = new Date();
  const query = {
    isActive: true,
    isPublic: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
    ...filters,
  };
  
  return this.find(query)
    .populate('applicableRestaurants', 'name')
    .populate('applicableFoodItems', 'name price');
};

couponSchema.statics.findByCode = function(code) {
  return this.findOne({ code: code.toUpperCase() })
    .populate('applicableRestaurants', 'name')
    .populate('applicableFoodItems', 'name price');
};

couponSchema.statics.getUsageStats = function(couponId) {
  return this.findById(couponId)
    .populate('redemptionHistory.orderId', 'total')
    .populate('redemptionHistory.userId', 'name email')
    .populate('redemptionHistory.restaurantId', 'name');
};

const Coupon = mongoose.model('Coupon', couponSchema);

export default Coupon;
