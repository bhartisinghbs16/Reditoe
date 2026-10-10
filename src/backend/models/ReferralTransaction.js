import mongoose from 'mongoose';

const referralTransactionSchema = new mongoose.Schema({
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Referrer ID is required'],
  },
  referredUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Referred user ID is required'],
  },
  referralCode: {
    type: String,
    required: [true, 'Referral code is required'],
    trim: true,
    uppercase: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'Order ID is required'],
  },
  amount: {
    type: Number,
    required: [true, 'Referral amount is required'],
    min: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'processed', 'failed'],
    default: 'pending',
  },
  processedAt: {
    type: Date,
  },
  failureReason: {
    type: String,
    trim: true,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// Indexes for performance
referralTransactionSchema.index({ referrerId: 1, status: 1 });
referralTransactionSchema.index({ referredUserId: 1 });
referralTransactionSchema.index({ referralCode: 1 });
referralTransactionSchema.index({ orderId: 1 });
referralTransactionSchema.index({ status: 1 });
referralTransactionSchema.index({ createdAt: -1 });

const ReferralTransaction = mongoose.model('ReferralTransaction', referralTransactionSchema);

export default ReferralTransaction;
