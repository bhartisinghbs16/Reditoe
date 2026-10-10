/**
 * Payout collection for admin dashboard.
 * New collection - does not modify existing collections.
 * Used by GET /admin/payouts.
 */
import mongoose from 'mongoose';

const payoutSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
  },
  orderIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Order',
    required: true,
    default: [],
  },
  grossAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  commissionAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  netAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed'],
    default: 'pending',
  },
  payoutMethod: {
    type: String,
    enum: ['bank', 'manual'],
    default: 'manual',
  },
  transactionId: {
    type: String,
    default: null,
  },
  notes: {
    type: String,
    default: null,
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

const Payout = mongoose.model('Payout', payoutSchema);

export default Payout;
