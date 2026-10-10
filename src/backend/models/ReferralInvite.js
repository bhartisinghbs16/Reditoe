import mongoose from 'mongoose';

const referralInviteSchema = new mongoose.Schema({
  referrerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  targetType: { type: String, enum: ['user', 'vendor', 'delivery_partner'], required: true, index: true },
  code: { type: String, required: true, unique: true, uppercase: true, index: true },
  rewardAmount: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ['invited', 'registered', 'approved', 'rewarded', 'rejected', 'expired'],
    default: 'invited',
    index: true,
  },
  referredEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  sharedAt: { type: Date, default: Date.now },
  registeredAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  rewardedAt: { type: Date, default: null },
  rewardTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

referralInviteSchema.index({ referrerUserId: 1, targetType: 1, createdAt: -1 });

export default mongoose.model('ReferralInvite', referralInviteSchema);
