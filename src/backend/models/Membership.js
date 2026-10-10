import mongoose from 'mongoose';

/**
 * Reditoe Plus membership.
 *
 * The customer app has six Plus screens and the API had nothing behind them,
 * so this is the model they read: one active membership per user, the savings
 * accrued against it, and the benefits/plans the marketing screens list.
 */

const membershipSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Membership must belong to a user'],
      index: true,
    },
    plan: {
      type: String,
      enum: ['monthly', 'quarterly', 'yearly'],
      default: 'monthly',
    },
    planLabel: {
      type: String,
      default: 'Monthly Plan',
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'paused'],
      default: 'active',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    validTill: {
      type: Date,
      required: true,
    },
    autoRenewal: {
      type: Boolean,
      default: true,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    /**
     * Running totals the "how much you save" panels read. Kept on the
     * membership rather than recomputed per request so the figures stay stable
     * between screens.
     */
    savings: {
      delivery: { type: Number, default: 0, min: 0 },
      discounts: { type: Number, default: 0, min: 0 },
      coupons: { type: Number, default: 0, min: 0 },
      cashback: { type: Number, default: 0, min: 0 },
    },
  },
  { timestamps: true }
);

membershipSchema.index({ userId: 1, status: 1 });

/** Expiry is a date comparison, not a stored flag that can drift. */
membershipSchema.virtual('isActive').get(function () {
  return this.status === 'active' && this.validTill > new Date();
});

membershipSchema.virtual('totalSaved').get(function () {
  const s = this.savings || {};
  return (s.delivery || 0) + (s.discounts || 0) + (s.coupons || 0) + (s.cashback || 0);
});

membershipSchema.set('toJSON', { virtuals: true });
membershipSchema.set('toObject', { virtuals: true });

const Membership = mongoose.model('Membership', membershipSchema);

export default Membership;
