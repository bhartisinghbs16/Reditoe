import mongoose from 'mongoose';

const referralProfileSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },
  referralCode: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true,
  },
  appliedReferralCode: {
    type: String,
    uppercase: true,
    default: null,
  },
  referrerUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  appliedAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
});

const ReferralProfile = mongoose.model('ReferralProfile', referralProfileSchema);

export default ReferralProfile;
