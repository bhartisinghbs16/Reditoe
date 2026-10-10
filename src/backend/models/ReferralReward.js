import mongoose from 'mongoose';

const referralRewardSchema = new mongoose.Schema({
  referrerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  refereeUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  referralCode: {
    type: String,
    required: true,
    uppercase: true,
    index: true,
  },
  firstOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'credited', 'skipped'],
    default: 'pending',
    index: true,
  },
  referrerRewardAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  refereeRewardAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  creditedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

const ReferralReward = mongoose.model('ReferralReward', referralRewardSchema);

export default ReferralReward;
