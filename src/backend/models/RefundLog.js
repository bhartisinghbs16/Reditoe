import mongoose from 'mongoose';

const refundLogSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'Refund log must have an order'],
  },
  paymentId: {
    type: String,
    required: [true, 'Payment ID is required for refund'],
    trim: true,
  },
  refundId: {
    type: String,
    required: [true, 'Refund ID is required'],
    trim: true,
  },
  amount: {
    type: Number,
    required: [true, 'Refund amount is required'],
    min: 0,
  },
  status: {
    type: String,
    enum: ['initiated', 'processed', 'failed'],
    default: 'initiated',
  },
  reason: {
    type: String,
    required: [true, 'Refund reason is required'],
    trim: true,
    maxlength: [500, 'Refund reason cannot exceed 500 characters'],
  },
  processedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Refund must be processed by someone'],
  },
  walletRefunded: {
    type: Number,
    default: 0,
    min: 0,
  },
  failureReason: {
    type: String,
    trim: true,
  },
  processedAt: {
    type: Date,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// Indexes for performance
refundLogSchema.index({ orderId: 1 });
refundLogSchema.index({ paymentId: 1 });
refundLogSchema.index({ refundId: 1 });
refundLogSchema.index({ status: 1 });
refundLogSchema.index({ processedBy: 1 });
refundLogSchema.index({ createdAt: -1 });

const RefundLog = mongoose.model('RefundLog', refundLogSchema);

export default RefundLog;
