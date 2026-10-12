import mongoose from 'mongoose';

/**
 * A sign-in code that has been sent to a mobile number and not yet used.
 *
 * Kept apart from the User document on purpose. A code is asked for before we
 * know whether the number belongs to anybody, and the old arrangement - save
 * the code on the user, creating a placeholder user first when there was none -
 * left an account behind for every number anyone ever typed into the box.
 *
 * One row per number. Asking for a new code replaces the row, which is also
 * what makes the throttle below work: the counters live beside the code they
 * limit, so they survive for as long as the code could be asked for again.
 */
const loginOtpSchema = new mongoose.Schema(
  {
    /** E.164, always +91 and ten digits: the form every account stores. */
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    /** Which app asked. A code requested on one app does not open another. */
    role: {
      type: String,
      enum: ['user', 'vendor', 'rider'],
      required: true,
    },
    /**
     * Hashed: whoever can read this collection must not be able to sign in as
     * somebody else with what they find in it.
     */
    codeHash: {
      type: String,
      required: true,
      select: false,
    },
    /** Wrong guesses against the code currently held. Reset by a new code. */
    attempts: {
      type: Number,
      default: 0,
    },
    sentAt: {
      type: Date,
      required: true,
    },
    /** When the code stops being accepted. */
    codeExpiresAt: {
      type: Date,
      required: true,
    },
    /** Start of the hour in which `sendsInWindow` is being counted. */
    windowStartedAt: {
      type: Date,
      required: true,
    },
    /** Codes sent to this number in the current window. */
    sendsInWindow: {
      type: Number,
      default: 1,
    },
    /**
     * When the row itself goes. Later than the code, so that a number that has
     * just used up its sends cannot start again by waiting for the code alone to
     * lapse.
     */
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

const LoginOtp = mongoose.models.LoginOtp || mongoose.model('LoginOtp', loginOtpSchema);

export default LoginOtp;
