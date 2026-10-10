/**
 * Rider Incentive Progress Model
 * Tracks individual rider progress for each incentive template
 */

import mongoose from 'mongoose';

const riderIncentiveProgressSchema = new mongoose.Schema({
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IncentiveTemplate',
    required: true,
    index: true
  },
  currentProgress: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  targetProgress: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    required: true,
    enum: ['active', 'completed', 'expired', 'claimed'],
    default: 'active',
    index: true
  },
  startedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  claimedAt: {
    type: Date
  },
  expiresAt: {
    type: Date,
    required: true
  },
  progressHistory: [{
    value: {
      type: Number,
      required: true,
      min: 0
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    trigger: {
      type: String,
      enum: ['order_completed', 'manual_update', 'auto_calculation', 'admin_adjustment'],
      default: 'auto_calculation'
    },
    metadata: {
      orderId: mongoose.Schema.Types.ObjectId,
      orderData: mongoose.Schema.Types.Mixed,
      previousValue: Number,
      newValue: Number
    }
  }],
  rewardAmount: {
    type: Number,
    required: true,
    min: 0
  },
  claimed: {
    type: Boolean,
    default: false
  },
  claimedRewardAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  claimsCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastProgressUpdate: {
    type: Date,
    default: Date.now
  },
  completionPercentage: {
    type: Number,
    default: 0
  },
  estimatedCompletion: {
    type: Date
  },
  milestones: [{
    value: Number,
    achieved: {
      type: Boolean,
      default: false
    },
    achievedAt: Date,
    reward: {
      type: Number,
      default: 0
    }
  }],
  notes: {
    type: String,
    maxlength: 500
  },
  adminNotes: {
    type: String,
    maxlength: 500
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
riderIncentiveProgressSchema.index({ riderId: 1, status: 1 });
riderIncentiveProgressSchema.index({ templateId: 1, status: 1 });
riderIncentiveProgressSchema.index({ riderId: 1, templateId: 1 });
riderIncentiveProgressSchema.index({ status: 1, expiresAt: 1 });
riderIncentiveProgressSchema.index({ riderId: 1, completedAt: -1 });
riderIncentiveProgressSchema.index({ riderId: 1, claimedAt: -1 });

// Virtual fields
riderIncentiveProgressSchema.virtual('progressPercentage').get(function() {
  if (this.targetProgress === 0) return 0;
  return Math.round((this.currentProgress / this.targetProgress) * 100);
});

riderIncentiveProgressSchema.virtual('isExpired').get(function() {
  return new Date() > this.expiresAt;
});

riderIncentiveProgressSchema.virtual('isCompleted').get(function() {
  return this.currentProgress >= this.targetProgress;
});

riderIncentiveProgressSchema.virtual('canClaim').get(function() {
  return this.status === 'completed' && !this.claimed && !this.isExpired;
});

riderIncentiveProgressSchema.virtual('timeRemaining').get(function() {
  if (this.isExpired) return 0;
  return Math.max(0, this.expiresAt - new Date());
});

riderIncentiveProgressSchema.virtual('daysRemaining').get(function() {
  if (this.isExpired) return 0;
  const msInDay = 24 * 60 * 60 * 1000;
  return Math.ceil((this.expiresAt - new Date()) / msInDay);
});

// Methods
riderIncentiveProgressSchema.methods.updateProgress = function(newValue, trigger = 'auto_calculation', metadata = {}) {
  const oldValue = this.currentProgress;
  
  // Don't update if new value is less than current (progress should only increase)
  if (newValue < oldValue) {
    return this;
  }
  
  // Update progress
  this.currentProgress = newValue;
  this.lastProgressUpdate = new Date();
  this.completionPercentage = Math.round((newValue / this.targetProgress) * 100);
  
  // Add to history
  this.progressHistory.push({
    value: newValue,
    timestamp: new Date(),
    trigger,
    metadata: {
      ...metadata,
      previousValue: oldValue,
      newValue: newValue
    }
  });
  
  // Check if completed
  if (newValue >= this.targetProgress && this.status === 'active') {
    this.status = 'completed';
    this.completedAt = new Date();
    this.estimatedCompletion = new Date();
  }
  
  // Limit history size to prevent document bloat
  if (this.progressHistory.length > 100) {
    this.progressHistory = this.progressHistory.slice(-50);
  }
  
  return this;
};

riderIncentiveProgressSchema.methods.claimReward = function() {
  if (!this.canClaim) {
    throw new Error('Incentive cannot be claimed');
  }
  
  this.status = 'claimed';
  this.claimed = true;
  this.claimedAt = new Date();
  this.claimedRewardAmount = this.rewardAmount;
  this.claimsCount += 1;
  
  return this;
};

riderIncentiveProgressSchema.methods.addMilestone = function(value, reward = 0) {
  const milestone = {
    value,
    achieved: false,
    reward,
    achievedAt: null
  };
  
  this.milestones.push(milestone);
  
  // Sort milestones by value
  this.milestones.sort((a, b) => a.value - b.value);
  
  return this;
};

riderIncentiveProgressSchema.methods.checkMilestones = function() {
  this.milestones.forEach(milestone => {
    if (!milestone.achieved && this.currentProgress >= milestone.value) {
      milestone.achieved = true;
      milestone.achievedAt = new Date();
    }
  });
  
  return this;
};

riderIncentiveProgressSchema.methods.estimateCompletion = function() {
  if (this.isCompleted || this.currentProgress === 0) {
    return null;
  }
  
  const progressRate = this.calculateProgressRate();
  if (progressRate === 0) {
    return null;
  }
  
  const remaining = this.targetProgress - this.currentProgress;
  const daysToComplete = Math.ceil(remaining / progressRate);
  
  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + daysToComplete);
  
  this.estimatedCompletion = estimatedDate;
  
  return estimatedDate;
};

riderIncentiveProgressSchema.methods.calculateProgressRate = function() {
  if (this.progressHistory.length < 2) {
    return 0;
  }
  
  const recent = this.progressHistory.slice(-10); // Last 10 progress updates
  if (recent.length < 2) return 0;
  
  const timeDiff = recent[recent.length - 1].timestamp - recent[0].timestamp;
  const progressDiff = recent[recent.length - 1].value - recent[0].value;
  
  if (timeDiff === 0) return 0;
  
  // Calculate progress per day
  const daysDiff = timeDiff / (1000 * 60 * 60 * 24);
  return daysDiff > 0 ? progressDiff / daysDiff : 0;
};

// Pre-save middleware
riderIncentiveProgressSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Auto-update completion percentage
  if (this.targetProgress > 0) {
    this.completionPercentage = Math.round((this.currentProgress / this.targetProgress) * 100);
  }
  
  // Check milestones
  this.checkMilestones();
  
  // Estimate completion if not completed
  if (!this.isCompleted && this.currentProgress > 0) {
    this.estimateCompletion();
  }
  
  // Auto-expire if past expiration
  if (this.isExpired && this.status !== 'expired') {
    this.status = 'expired';
  }
  
  next();
});

// Static methods
riderIncentiveProgressSchema.statics.getActiveProgress = function(riderId) {
  return this.find({
    riderId,
    status: 'active',
    expiresAt: { $gt: new Date() }
  }).populate('templateId');
};

riderIncentiveProgressSchema.statics.getCompletedProgress = function(riderId) {
  return this.find({
    riderId,
    status: 'completed'
  }).populate('templateId').sort({ completedAt: -1 });
};

riderIncentiveProgressSchema.statics.getClaimableProgress = function(riderId) {
  return this.find({
    riderId,
    status: 'completed',
    claimed: false,
    expiresAt: { $gt: new Date() }
  }).populate('templateId');
};

riderIncentiveProgressSchema.statics.getProgressHistory = function(riderId, limit = 50) {
  return this.find({ riderId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .populate('templateId');
};

riderIncentiveProgressSchema.statics.getProgressByTemplate = function(templateId, status = null) {
  const query = { templateId };
  if (status) {
    query.status = status;
  }
  
  return this.find(query).populate('riderId').sort({ createdAt: -1 });
};

riderIncentiveProgressSchema.statics.cleanupExpired = function() {
  return this.deleteMany({
    status: 'expired',
    expiresAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Delete expired after 30 days
  });
};

const RiderIncentiveProgress = mongoose.model('RiderIncentiveProgress', riderIncentiveProgressSchema);

export default RiderIncentiveProgress;
