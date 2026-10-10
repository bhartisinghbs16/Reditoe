/**
 * Rider Bank Account Model
 * Handles rider bank account information for withdrawals and payments
 */

import mongoose from 'mongoose';

const bankAccountSchema = new mongoose.Schema({
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  
  // Bank Account Information
  accountHolderName: {
    type: String,
    required: true,
    trim: true,
  },
  accountNumber: {
    type: String,
    required: true,
    trim: true,
  },
  confirmAccountNumber: {
    type: String,
    required: true,
    trim: true,
  },
  ifscCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: function(value) {
        // Basic IFSC code validation (11 characters, alphanumeric)
        return /^[A-Z]{4}0[A-Z0-9]{7}$/.test(value);
      },
      message: 'Invalid IFSC code format',
    },
  },
  bankName: {
    type: String,
    required: true,
    trim: true,
  },
  branchName: {
    type: String,
    required: true,
    trim: true,
  },
  
  // Account Type
  accountType: {
    type: String,
    enum: ['savings', 'current'],
    required: true,
  },
  
  // Verification Status
  isVerified: {
    type: Boolean,
    default: false,
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected', 'failed'],
    default: 'pending',
  },
  verificationAttempts: {
    type: Number,
    default: 0,
  },
  lastVerificationAttempt: {
    type: Date,
  },
  verifiedAt: {
    type: Date,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  rejectionReason: {
    type: String,
  },
  
  // Withdrawal Settings
  withdrawalLimit: {
    type: Number,
    default: 50000, // Default ₹50,000 per day
    min: 0,
  },
  dailyWithdrawalCount: {
    type: Number,
    default: 0,
  },
  dailyWithdrawalAmount: {
    type: Number,
    default: 0,
  },
  lastWithdrawalDate: {
    type: Date,
  },
  
  // Payout Information
  payoutMethod: {
    type: String,
    enum: ['bank_transfer', 'upi', 'cash'],
    default: 'bank_transfer',
  },
  upiId: {
    type: String,
    trim: true,
  },
  
  // Settlement Information
  settlementCycle: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'weekly',
  },
  settlementDay: {
    type: Number,
    default: 1,
    min: 1,
    max: 31,
  },
  autoSettlement: {
    type: Boolean,
    default: false,
  },
  
  // Compliance Information
  panNumber: {
    type: String,
    uppercase: true,
    trim: true,
  },
  aadhaarNumber: {
    type: String,
    trim: true,
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
  },
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Indexes for better performance
bankAccountSchema.index({ riderId: 1 });
bankAccountSchema.index({ accountNumber: 1 });
bankAccountSchema.index({ ifscCode: 1 });
bankAccountSchema.index({ verificationStatus: 1 });
bankAccountSchema.index({ status: 1 });

// Pre-save middleware
bankAccountSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  
  // Auto-verify if all required fields are present and valid
  if (this.accountNumber && this.confirmAccountNumber) {
    if (this.accountNumber !== this.confirmAccountNumber) {
      this.invalidate('Account numbers do not match');
    }
  }
  
  next();
});

// Instance methods
bankAccountSchema.methods.verifyAccount = function(verifiedBy, notes = '') {
  this.isVerified = true;
  this.verificationStatus = 'verified';
  this.verifiedAt = new Date();
  this.verifiedBy = verifiedBy;
  this.verificationAttempts = 0;
  this.rejectionReason = '';
  
  if (notes) {
    this.notes = notes;
  }
  
  return this.save();
};

bankAccountSchema.methods.rejectAccount = function(reason, verifiedBy) {
  this.isVerified = false;
  this.verificationStatus = 'rejected';
  this.rejectionReason = reason;
  this.verifiedBy = verifiedBy;
  this.verificationAttempts += 1;
  this.lastVerificationAttempt = new Date();
  
  return this.save();
};

bankAccountSchema.methods.markVerificationFailed = function() {
  this.verificationStatus = 'failed';
  this.verificationAttempts += 1;
  this.lastVerificationAttempt = new Date();
  
  return this.save();
};

bankAccountSchema.methods.canWithdraw = function(amount) {
  if (this.status !== 'active' || !this.isVerified) {
    return false;
  }
  
  // Check daily withdrawal limits
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isSameDay = this.lastWithdrawalDate && 
    this.lastWithdrawalDate.toDateString() === today.toDateString();
  
  if (isSameDay) {
    if (this.dailyWithdrawalCount >= 3) {
      return false; // Max 3 withdrawals per day
    }
    if (this.dailyWithdrawalAmount + amount > this.withdrawalLimit) {
      return false; // Exceeds daily limit
    }
  }
  
  return true;
};

bankAccountSchema.methods.updateWithdrawalStats = function(amount) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isSameDay = this.lastWithdrawalDate && 
    this.lastWithdrawalDate.toDateString() === today.toDateString();
  
  if (isSameDay) {
    this.dailyWithdrawalCount += 1;
    this.dailyWithdrawalAmount += amount;
  } else {
    this.dailyWithdrawalCount = 1;
    this.dailyWithdrawalAmount = amount;
  }
  
  this.lastWithdrawalDate = new Date();
  return this.save();
};

bankAccountSchema.methods.getWithdrawalStats = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isSameDay = this.lastWithdrawalDate && 
    this.lastWithdrawalDate.toDateString() === today.toDateString();
  
  return {
    isSameDay,
    dailyCount: this.dailyWithdrawalCount,
    dailyAmount: this.dailyWithdrawalAmount,
    limit: this.withdrawalLimit,
    remainingLimit: isSameDay ? 
      Math.max(0, this.withdrawalLimit - this.dailyWithdrawalAmount) : 
      this.withdrawalLimit,
    lastWithdrawalDate: this.lastWithdrawalDate,
  };
};

// Static methods
bankAccountSchema.statics.findByRiderId = function(riderId) {
  return this.findOne({ riderId, status: 'active' }).sort({ createdAt: -1 });
};

bankAccountSchema.statics.getVerifiedAccounts = function() {
  return this.find({ isVerified: true, status: 'active' }).sort({ createdAt: -1 });
};

bankAccountSchema.statics.getPendingVerification = function() {
  return this.find({ verificationStatus: 'pending', status: 'active' }).sort({ createdAt: -1 });
};

bankAccountSchema.statics.getWithdrawalRequests = function(riderId, startDate, endDate) {
  const query = {
    riderId,
    status: 'active',
    'withdrawalRequests.date': {
      $gte: startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      $lte: endDate || new Date(),
    },
  };
  
  return this.find(query).sort({ 'withdrawalRequests.date': -1 });
};

const RiderBankAccount = mongoose.model('RiderBankAccount', bankAccountSchema);

export default RiderBankAccount;
