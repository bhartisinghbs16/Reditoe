import mongoose from 'mongoose';

/**
 * Somebody asking, from the website, for their account to be deleted.
 * Recorded for the team to confirm and carry out; nothing is deleted by
 * the request itself.
 */
const accountDeletionRequestSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, trim: true, index: true },
    role: { type: String, enum: ['user', 'vendor', 'rider'], default: 'user' },
    email: { type: String, trim: true, default: '' },
    reason: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['pending', 'completed', 'rejected'], default: 'pending' },
  },
  { timestamps: true }
);

export default mongoose.models.AccountDeletionRequest ||
  mongoose.model('AccountDeletionRequest', accountDeletionRequestSchema);
