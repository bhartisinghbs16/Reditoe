/**
 * Financial Transaction model for tracking all financial activities
 */
import mongoose from 'mongoose';

const financialTransactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['order_payment', 'commission', 'refund', 'settlement', 'adjustment', 'fee'],
    required: [true, 'Transaction type is required'],
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
  },
  commissionAmount: {
    type: Number,
    default: 0,
  },
  vendorAmount: {
    type: Number,
    default: 0,
  },
  gstAmount: {
    type: Number,
    default: 0,
  },
  platformFee: {
    type: Number,
    default: 0,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'card', 'online', 'wallet', 'bank'],
  },
  paymentGatewayId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentGateway',
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'reversed'],
    default: 'pending',
  },
  transactionId: {
    type: String,
    unique: true,
    sparse: true,
  },
  gatewayTransactionId: {
    type: String,
  },
  refundInfo: {
    isRefund: {
      type: Boolean,
      default: false,
    },
    originalTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FinancialTransaction',
    },
    refundReason: {
      type: String,
    },
    refundNotes: {
      type: String,
    },
  },
  adjustmentInfo: {
    isAdjustment: {
      type: Boolean,
      default: false,
    },
    adjustmentType: {
      type: String,
      enum: ['commission_override', 'manual_credit', 'manual_debit', 'fee_waiver'],
    },
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reason: {
      type: String,
    },
    previousAmount: {
      type: Number,
    },
  },
  settlementInfo: {
    isSettlement: {
      type: Boolean,
      default: false,
    },
    settlementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payout',
    },
    settlementDate: {
      type: Date,
    },
  },
  processedAt: {
    type: Date,
  },
  notes: {
    type: String,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
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

// Generate transaction ID
financialTransactionSchema.pre('save', function(next) {
  if (this.isNew && !this.transactionId) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    this.transactionId = `TXN_${timestamp}_${random}`.toUpperCase();
  }
  next();
});

const FinancialTransaction = mongoose.model('FinancialTransaction', financialTransactionSchema);

export default FinancialTransaction;
