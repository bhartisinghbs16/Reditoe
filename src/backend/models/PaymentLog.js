import mongoose from 'mongoose';

const paymentLogSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'Payment log must have an order'],
  },
  paymentId: {
    type: String,
    required: [true, 'Payment ID is required'],
    trim: true,
  },
  signature: {
    type: String,
    default: null,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'initiated', 'authorized', 'captured', 'success', 'failed', 'refunded'],
    required: [true, 'Payment status is required'],
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: 0,
  },
  currency: {
    type: String,
    default: 'INR',
    enum: ['INR'],
  },
  method: {
    type: String,
    enum: ['card', 'netbanking', 'upi', 'wallet', 'cashfree'],
  },
  failureReason: {
    type: String,
    trim: true,
  },
  errorCode: {
    type: String,
    trim: true,
  },
  webhookReceived: {
    type: Boolean,
    default: false,
  },
  webhookProcessedAt: {
    type: Date,
  },
  refundId: {
    type: String,
    trim: true,
  },
  refundAmount: {
    type: Number,
    min: 0,
  },
  refundStatus: {
    type: String,
    enum: ['pending', 'processed', 'failed'],
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// Indexes for performance
paymentLogSchema.index({ orderId: 1 });
paymentLogSchema.index({ status: 1 });
paymentLogSchema.index({ createdAt: -1 });
paymentLogSchema.index({ webhookReceived: 1 });

// Prevent duplicate payment logs for the same paymentId
paymentLogSchema.index({ paymentId: 1 }, { unique: true });

const PaymentLog = mongoose.model('PaymentLog', paymentLogSchema);

export default PaymentLog;
