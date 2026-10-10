import mongoose from 'mongoose';

const refundSchema = new mongoose.Schema({
  refundId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'Refund must be associated with an order'],
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Refund must be associated with a user'],
  },
  refundAmount: {
    type: Number,
    required: [true, 'Refund amount is required'],
    min: [0, 'Refund amount cannot be negative'],
  },
  refundStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  refundReason: {
    type: String,
    required: [true, 'Refund reason is required'],
    trim: true,
  },
  adminActionLog: [{
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      enum: ['created', 'approved', 'rejected', 'escalated', 'processed'],
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],
  refundMethod: {
    type: String,
    enum: ['original_payment', 'wallet', 'bank_transfer', 'upi'],
    default: 'original_payment',
  },
  processingDetails: {
    transactionId: String,
    processedAt: Date,
    /*
     * The bank's reference for the money moving — Razorpay's ARN, which a
     * bank statement calls the RRN. It is what a customer chasing their money
     * can quote to their own bank; the gateway's refund id means nothing
     * outside Razorpay. Empty until the acquirer issues it.
     */
    bankRRN: {
      type: String,
      default: '',
      trim: true,
    },
    processor: String,
  },
  refundTimeline: [{
    status: {
      type: String,
      enum: ['requested', 'under_review', 'approved', 'rejected', 'processed', 'completed', 'pending'],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    message: {
      type: String,
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  }],
  evidence: [{
    type: {
      type: String,
      enum: ['image', 'document', 'text'],
      required: true,
    },
    url: String,
    description: String,
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  estimatedProcessingTime: Date,
  actualProcessingTime: Date,
}, {
  timestamps: true,
});

// Index for efficient queries
refundSchema.index({ orderId: 1 });
refundSchema.index({ userId: 1 });
refundSchema.index({ refundStatus: 1 });
refundSchema.index({ createdAt: -1 });

/*
 * Mint the reference before validation, not before save.
 *
 * `refundId` is required, and Mongoose validates a document before its save
 * hooks run - so generating it here on 'save' was always too late and every
 * refund was rejected with "Path `refundId` is required", whether it was
 * raised by a customer or initiated by an admin. No refund could be created
 * at all, which is why the Refund Requests screen was permanently empty.
 *
 * Counting documents is racy under concurrent inserts; the unique index on
 * refundId is what actually guarantees no two refunds share a reference, and
 * a clash surfaces as a duplicate-key error rather than a silent overwrite.
 */
refundSchema.pre('validate', async function(next) {
  if (this.isNew && !this.refundId) {
    const count = await this.constructor.countDocuments();
    this.refundId = `REF${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

const Refund = mongoose.model('Refund', refundSchema);

export default Refund;
