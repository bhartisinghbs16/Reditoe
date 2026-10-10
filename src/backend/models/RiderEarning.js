/**
 * Rider Earnings model for tracking detailed rider earnings per order
 */
import mongoose from 'mongoose';

const riderEarningSchema = new mongoose.Schema({
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
  },
  // Earnings breakdown
  deliveryFee: {
    type: Number,
    required: true,
    min: 0,
  },
  commission: {
    type: Number,
    default: 0,
    min: 0,
  },
  incentive: {
    type: Number,
    default: 0,
    min: 0,
  },
  penalty: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalEarning: {
    type: Number,
    required: true,
    min: 0,
  },
  // Distance and time metrics
  distance: {
    type: Number, // in km
    default: 0,
    min: 0,
  },
  deliveryTime: {
    type: Number, // in minutes
    default: 0,
    min: 0,
  },
  // Status
  status: {
    type: String,
    enum: ['earned', 'adjusted', 'reversed'],
    default: 'earned',
  },
  // Adjustment details
  adjustmentInfo: {
    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    adjustmentType: {
      type: String,
      enum: ['incentive', 'penalty', 'correction'],
    },
    originalAmount: {
      type: Number,
    },
    adjustmentAmount: {
      type: Number,
    },
    reason: {
      type: String,
      trim: true,
    },
    adjustedAt: {
      type: Date,
    },
  },
  // Incentive tracking
  relatedIncentives: [{
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'IncentiveTemplate'
    },
    progressContribution: {
      type: Number,
      default: 0
    },
    timestamp: {
      type: Date,
      default: Date.now()
    }
  }],
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
riderEarningSchema.index({ createdAt: -1 });
riderEarningSchema.index({ orderId: 1 });
riderEarningSchema.index({ status: 1 });
riderEarningSchema.index({ organizationId: 1 });

// Ensure unique order per rider
riderEarningSchema.index({ riderId: 1, orderId: 1 }, { unique: true });

const RiderEarning = mongoose.model('RiderEarning', riderEarningSchema);

export default RiderEarning;
