/**
 * Rider Withdrawal Request model for tracking rider withdrawal requests
 */
import mongoose from 'mongoose';

const riderWithdrawalSchema = new mongoose.Schema({
  withdrawalId: {
    type: String,
    required: true,
    default: function() {
      return 'WD-' + Date.now() + '-' + 
        Math.random().toString(36).substr(2, 9).toUpperCase();
    },
  },
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  withdrawalType: {
    type: String,
    enum: ['bank_transfer', 'upi', 'cash'],
    default: 'bank_transfer',
  },
  bankAccountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RiderBankAccount',
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'approved', 'rejected', 'cancelled', 'processed'],
    default: 'pending',
  },
  isAutopay: {
    type: Boolean,
    default: false,
  },
  autopayStatus: {
    type: String,
    enum: ['queued', 'approved', 'processed', 'failed', 'manual_fallback'],
    default: 'manual_fallback',
  },
  autopayRunAt: {
    type: Date,
  },
  autopayFailureReason: {
    type: String,
    trim: true,
  },
  autopayReference: {
    type: String,
    trim: true,
  },
  // Bank details snapshot at time of withdrawal
  bankDetails: {
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
    ifsc: {
      type: String,
      required: true,
      trim: true,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    branch: {
      type: String,
      trim: true,
    },
  },
  // Admin processing details
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  processedAt: {
    type: Date,
  },
  rejectedAt: {
    type: Date,
  },
  cancelledAt: {
    type: Date,
  },
  rejectionReason: {
    type: String,
    trim: true,
  },
  cancellationReason: {
    type: String,
    trim: true,
  },
  transactionReference: {
    type: String,
    trim: true,
  },
  // Processing notes
  adminNotes: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  // Request timing
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  estimatedProcessingTime: {
    type: Date,
  },
  // Multi-tenant organization support
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes for performance
riderWithdrawalSchema.index({ riderId: 1, createdAt: -1 });
riderWithdrawalSchema.index({ status: 1 });
riderWithdrawalSchema.index({ isAutopay: 1, autopayStatus: 1, createdAt: -1 });
riderWithdrawalSchema.index({ organizationId: 1 });
riderWithdrawalSchema.index({ withdrawalId: 1 }, { unique: true });

// Generate withdrawal ID
riderWithdrawalSchema.pre('save', function(next) {
  if (this.isNew && !this.withdrawalId) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    this.withdrawalId = `WDR_${timestamp}_${random}`.toUpperCase();
  }
  next();
});

const RiderWithdrawal = mongoose.model('RiderWithdrawal', riderWithdrawalSchema);

export default RiderWithdrawal;
