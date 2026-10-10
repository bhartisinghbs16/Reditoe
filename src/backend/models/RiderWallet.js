/**
 * Rider Wallet model for tracking rider earnings and withdrawals
 */
import mongoose from 'mongoose';

const riderWalletSchema = new mongoose.Schema({
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  /**
   * What this rider can actually withdraw: money earned by delivering, plus
   * whatever bonus has been unlocked by doing so.
   */
  balance: {
    type: Number,
    default: 0,
    min: 0,
  },

  /**
   * Bonuses that are not withdrawable yet.
   *
   * A joining bonus or a referral is credited here, and a fixed amount of it
   * converts into withdrawable balance on each delivery completed. That is
   * the whole point of it: the bonus rewards riding, so it is released by
   * riding rather than paid out on the day somebody signs up and leaves.
   */
  bonusBalance: {
    type: Number,
    default: 0,
    min: 0,
  },

  /** How much bonus has been released so far, for the rider's own statement. */
  bonusConverted: {
    type: Number,
    default: 0,
    min: 0,
  },

  /**
   * Every credit and conversion, so a rider asking "where did my joining
   * bonus go" can be shown rather than told.
   */
  bonusLedger: [
    {
      _id: false,
      type: {
        type: String,
        enum: ['joining_bonus', 'referral_bonus', 'admin_adjustment', 'converted'],
        required: true,
      },
      amount: Number,
      note: String,
      orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: Date.now },
    },
  ],
  totalEarnings: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalWithdrawn: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastEarningDate: {
    type: Date,
  },
  lastWithdrawDate: {
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
riderWalletSchema.index({ organizationId: 1 });

const RiderWallet = mongoose.model('RiderWallet', riderWalletSchema);

export default RiderWallet;
