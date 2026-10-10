/**
 * Referral model for referral program management
 */
import mongoose from 'mongoose';

const referralSchema = new mongoose.Schema({
  // Referral program configuration
  programName: {
    type: String,
    default: 'Vinsta Referral Program',
  },
  description: {
    type: String,
    default: 'Invite friends and earn rewards!',
  },
  isActive: {
    type: Boolean,
    default: true,
  },

  // Reward configuration
  referrerReward: {
    type: {
      type: String,
      enum: ['cashback', 'points', 'discount'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
    },
  },

  refereeReward: {
    type: {
      type: String,
      enum: ['cashback', 'points', 'discount'],
      required: true,
    },
    value: {
      type: Number,
      required: true,
      min: 0,
    },
    description: {
      type: String,
    },
  },

  // Referral codes and tracking
  referralCodes: [{
    code: {
      type: String,
      required: true,
      uppercase: true,
    },
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    usedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    usedAt: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
    },
  }],

  // Referral tracking
  referralHistory: [{
    referrerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    refereeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    referralCode: {
      type: String,
      required: true,
    },
    refereeFirstOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
    referrerRewardGiven: {
      type: Boolean,
      default: false,
    },
    refereeRewardGiven: {
      type: Boolean,
      default: false,
    },
    referrerRewardAmount: {
      type: Number,
      default: 0,
    },
    refereeRewardAmount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'expired'],
      default: 'pending',
    },
    completedAt: {
      type: Date,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],

  // Usage limits and restrictions
  maxReferralsPerUser: {
    type: Number,
    default: 10,
    min: 1,
  },
  referralCodeExpiryDays: {
    type: Number,
    default: 30,
    min: 1,
  },
  minOrderValueForReward: {
    type: Number,
    default: 100,
    min: 0,
  },

  // Analytics
  totalReferrals: {
    type: Number,
    default: 0,
  },
  successfulReferrals: {
    type: Number,
    default: 0,
  },
  totalRewardsGiven: {
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
referralSchema.index({ 'referralCodes.code': 1 });
referralSchema.index({ 'referralCodes.referrerId': 1 });
referralSchema.index({ 'referralHistory.referrerId': 1 });
referralSchema.index({ 'referralHistory.refereeId': 1 });

// Instance methods
referralSchema.methods.generateReferralCode = function(userId) {
  const code = this.generateUniqueCode(userId);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + this.referralCodeExpiryDays);

  this.referralCodes.push({
    code,
    referrerId: userId,
    expiresAt,
  });

  return this.save();
};

referralSchema.methods.generateUniqueCode = function(userId) {
  const userStr = userId.toString().slice(-6);
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `REF${userStr}${randomStr}`;
};

referralSchema.methods.useReferralCode = function(code, refereeId) {
  const referralCode = this.referralCodes.find(rc => 
    rc.code === code.toUpperCase() && 
    !rc.isUsed && 
    (!rc.expiresAt || rc.expiresAt > new Date())
  );

  if (!referralCode) {
    throw new Error('Invalid or expired referral code');
  }

  referralCode.isUsed = true;
  referralCode.usedBy = refereeId;
  referralCode.usedAt = new Date();

  // Add to referral history
  this.referralHistory.push({
    referrerId: referralCode.referrerId,
    refereeId,
    referralCode: code,
    status: 'pending',
  });

  this.totalReferrals += 1;

  return this.save();
};

referralSchema.methods.completeReferral = function(referrerId, refereeId, orderId) {
  const referral = this.referralHistory.find(r => 
    r.referrerId.toString() === referrerId.toString() && 
    r.refereeId.toString() === refereeId.toString() && 
    r.status === 'pending'
  );

  if (!referral) {
    throw new Error('Referral not found or already completed');
  }

  referral.refereeFirstOrder = orderId;
  referral.status = 'completed';
  referral.completedAt = new Date();
  this.successfulReferrals += 1;

  return this.save();
};

referralSchema.methods.giveRewards = function(referrerId, refereeId, referrerAmount, refereeAmount) {
  const referral = this.referralHistory.find(r => 
    r.referrerId.toString() === referrerId.toString() && 
    r.refereeId.toString() === refereeId.toString() && 
    r.status === 'completed' && 
    !r.referrerRewardGiven && 
    !r.refereeRewardGiven
  );

  if (!referral) {
    throw new Error('Referral not found or rewards already given');
  }

  referral.referrerRewardGiven = true;
  referral.refereeRewardGiven = true;
  referral.referrerRewardAmount = referrerAmount;
  referral.refereeRewardAmount = refereeAmount;
  this.totalRewardsGiven += (referrerAmount + refereeAmount);

  return this.save();
};

// Static methods
referralSchema.statics.getReferralProgram = function() {
  return this.findOne({ isActive: true }).populate('referralHistory.referrerId', 'name email')
    .populate('referralHistory.refereeId', 'name email');
};

referralSchema.statics.getUserReferralCode = function(userId) {
  return this.findOne({ isActive: true })
    .then(program => {
      if (!program) return null;
      const referralCode = program.referralCodes.find(rc => 
        rc.referrerId.toString() === userId.toString() && 
        !rc.isUsed
      );
      return referralCode ? referralCode.code : null;
    });
};

referralSchema.statics.getUserReferralStats = function(userId) {
  return this.findOne({ isActive: true })
    .then(program => {
      if (!program) return null;
      
      const userReferrals = program.referralHistory.filter(r => 
        r.referrerId.toString() === userId.toString()
      );
      
      const successfulReferrals = userReferrals.filter(r => r.status === 'completed');
      
      return {
        totalReferrals: userReferrals.length,
        successfulReferrals: successfulReferrals.length,
        totalRewards: successfulReferrals.reduce((sum, r) => sum + r.referrerRewardAmount, 0),
        referralCode: program.referralCodes.find(rc => 
          rc.referrerId.toString() === userId.toString() && 
          !rc.isUsed
        )?.code || null,
      };
    });
};

referralSchema.statics.getReferralAnalytics = function(startDate, endDate) {
  return this.findOne({ isActive: true })
    .then(program => {
      if (!program) return null;
      
      let referrals = program.referralHistory;
      
      if (startDate || endDate) {
        const start = startDate ? new Date(startDate) : new Date(0);
        const end = endDate ? new Date(endDate) : new Date();
        referrals = referrals.filter(r => r.createdAt >= start && r.createdAt <= end);
      }
      
      const pending = referrals.filter(r => r.status === 'pending').length;
      const completed = referrals.filter(r => r.status === 'completed').length;
      const expired = referrals.filter(r => r.status === 'expired').length;
      
      return {
        total: referrals.length,
        pending,
        completed,
        expired,
        conversionRate: referrals.length > 0 ? (completed / referrals.length) * 100 : 0,
        totalRewards: referrals.reduce((sum, r) => sum + r.referrerRewardAmount + r.refereeRewardAmount, 0),
      };
    });
};

const Referral = mongoose.model('Referral', referralSchema);

export default Referral;
