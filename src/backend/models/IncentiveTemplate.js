/**
 * Incentive Template Model
 * Defines incentive templates that can be assigned to riders
 */

import mongoose from 'mongoose';

const incentiveTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Incentive name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  type: {
    type: String,
    required: [true, 'Incentive type is required'],
    enum: ['orders_completed', 'earnings_target', 'rating_target', 'time_based', 'area_based', 'peak_hours'],
    index: true
  },
  targetValue: {
    type: Number,
    required: [true, 'Target value is required'],
    min: [0, 'Target value must be positive']
  },
  rewardAmount: {
    type: Number,
    required: [true, 'Reward amount is required'],
    min: [0, 'Reward amount must be positive']
  },
  periodType: {
    type: String,
    required: [true, 'Period type is required'],
    enum: ['daily', 'weekly', 'monthly', 'custom'],
    default: 'weekly'
  },
  periodStart: {
    type: Date,
    // Required only for custom periods
    validate: {
      validator: function() {
        return this.periodType === 'custom' ? !!this.periodStart : true;
      },
      message: 'Period start is required for custom periods'
    }
  },
  periodEnd: {
    type: Date,
    // Required only for custom periods
    validate: {
      validator: function() {
        return this.periodType === 'custom' ? !!this.periodEnd : true;
      },
      message: 'Period end is required for custom periods'
    }
  },
  conditions: {
    minOrderValue: {
      type: Number,
      min: 0,
      default: 0
    },
    maxOrderValue: {
      type: Number,
      min: 0,
      default: 999999
    },
    timeRestrictions: [{
      type: String,
      enum: ['peak_hours', 'weekend_only', 'weekday_only', 'morning', 'evening', 'night']
    }],
    areaRestrictions: [{
      type: String,
      trim: true
    }],
    minRating: {
      type: Number,
      min: 1,
      max: 5,
      default: 1
    },
    maxDistance: {
      type: Number,
      min: 0,
      default: 999999
    }
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  maxClaims: {
    type: Number,
    min: 1,
    default: 1
  },
  priority: {
    type: Number,
    default: 0,
    index: true
  },
  autoAssign: {
    type: Boolean,
    default: true
  },
  targetRiderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  excludeRiderIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  category: {
    type: String,
    enum: ['performance', 'engagement', 'retention', 'growth'],
    default: 'performance'
  },
  tags: [{
    type: String,
    trim: true
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
incentiveTemplateSchema.index({ isActive: 1, priority: -1 });
incentiveTemplateSchema.index({ type: 1, isActive: 1 });
incentiveTemplateSchema.index({ periodType: 1, isActive: 1 });
incentiveTemplateSchema.index({ category: 1, isActive: 1 });

// Virtual fields
incentiveTemplateSchema.virtual('isActivePeriod').get(function() {
  const now = new Date();
  
  if (this.periodType === 'custom') {
    return this.periodStart <= now && now <= this.periodEnd;
  }
  
  // For daily, weekly, monthly, check if current time falls within the period
  if (this.periodType === 'daily') {
    return true; // Daily incentives reset every day
  }
  
  if (this.periodType === 'weekly') {
    const startOfWeek = new Date(now);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    return now >= startOfWeek && now < endOfWeek;
  }
  
  if (this.periodType === 'monthly') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return now >= startOfMonth && now < endOfMonth;
  }
  
  return true;
});

// Methods
incentiveTemplateSchema.methods.isEligibleForRider = function(riderId, riderData = {}) {
  // Check if rider is excluded
  if (this.excludeRiderIds && this.excludeRiderIds.includes(riderId)) {
    return false;
  }
  
  // Check if rider is specifically targeted
  if (this.targetRiderIds && this.targetRiderIds.length > 0) {
    return this.targetRiderIds.includes(riderId);
  }
  
  // Check rating condition
  if (this.conditions.minRating && riderData.currentRating < this.conditions.minRating) {
    return false;
  }
  
  return true;
};

incentiveTemplateSchema.methods.calculateProgress = function(riderData, progressData = {}) {
  const { type, targetValue } = this;
  
  switch (type) {
    case 'orders_completed':
      return Math.min(progressData.completedOrders || 0, targetValue);
    
    case 'earnings_target':
      return Math.min(progressData.totalEarnings || 0, targetValue);
    
    case 'rating_target':
      return progressData.currentRating >= targetValue ? targetValue : 0;
    
    case 'time_based':
      return Math.min(progressData.onlineHours || 0, targetValue);
    
    case 'area_based':
      return Math.min(progressData.areaOrders || 0, targetValue);
    
    case 'peak_hours':
      return Math.min(progressData.peakHoursOrders || 0, targetValue);
    
    default:
      return 0;
  }
};

// Static methods
incentiveTemplateSchema.statics.getActiveTemplates = function() {
  return this.find({ isActive: true }).sort({ priority: -1, createdAt: -1 });
};

incentiveTemplateSchema.statics.getTemplatesForRider = function(riderId, riderData = {}) {
  return this.find({ 
    isActive: true,
    $or: [
      { targetRiderIds: { $size: 0 } }, // No specific targets
      { targetRiderIds: riderId } // Or rider is specifically targeted
    ],
    excludeRiderIds: { $ne: riderId } // Not excluded
  }).sort({ priority: -1, createdAt: -1 });
};

// Pre-save middleware
incentiveTemplateSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const IncentiveTemplate = mongoose.model('IncentiveTemplate', incentiveTemplateSchema);

export default IncentiveTemplate;
