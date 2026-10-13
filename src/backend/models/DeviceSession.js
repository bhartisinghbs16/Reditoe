import mongoose from 'mongoose';

/**
 * A phone that has been signed in with a one-time code and is allowed to come
 * back without another one - "remember this device".
 *
 * This is deliberately small and short-lived. A remembered device is a standing
 * credential that outlasts the ordinary session token, so it is bounded three
 * ways: it expires on a fixed date counted from the code that created it (using
 * it does not extend it), an account keeps only a few of them (the oldest is
 * dropped to make room), and signing out revokes it.
 *
 * What is stored is a hash. The secret itself lives only on the phone, so
 * reading this collection does not let anybody sign in as someone else.
 */
const deviceSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    /** Which app it was issued to; one app's device is not good for another. */
    role: {
      type: String,
      enum: ['user', 'vendor', 'rider'],
      required: true,
    },
    /** Chosen by the app on first launch and kept on the phone. */
    deviceId: {
      type: String,
      required: true,
    },
    /** SHA-256 of the secret the phone holds. */
    secretHash: {
      type: String,
      required: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    /** A fixed date: using the session never moves it. */
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

// One row per phone per account: signing in again on the same phone replaces it.
deviceSessionSchema.index({ user: 1, deviceId: 1 }, { unique: true });

const DeviceSession =
  mongoose.models.DeviceSession || mongoose.model('DeviceSession', deviceSessionSchema);

export default DeviceSession;
