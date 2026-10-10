import mongoose from 'mongoose';

/**
 * Proof that whoever is signing up holds the email address and phone number
 * they typed.
 *
 * Kept apart from the User document on purpose: at this point there is no
 * account, and creating one to hold a half-finished verification would leave
 * unusable accounts behind every time somebody abandoned a signup.
 *
 * A row is short-lived and removed by the database itself once it expires, so
 * codes do not accumulate and an abandoned signup leaves nothing behind.
 */
const signupVerificationSchema = new mongoose.Schema(
  {
    /** Which contact detail this row is about. */
    channel: {
      type: String,
      enum: ['email', 'phone'],
      required: true,
    },
    /** Normalised, so "  A@b.com " and "a@b.com" are the same row. */
    value: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    /**
     * Hashed: whoever can read this collection should not be able to sign up
     * as somebody else.
     *
     * Required only until the code has been used. It is cleared on success -
     * a spent code should not be sitting there to be replayed - and a flat
     * `required: true` refused that write.
     */
    codeHash: {
      type: String,
      select: false,
      required: function requiredUntilVerified() {
        return this.verified !== true;
      },
    },
    attempts: {
      type: Number,
      default: 0,
    },
    verified: {
      type: Boolean,
      default: false,
    },
    /**
     * Handed back once the code is confirmed and required by registration, so
     * the server never has to take the app's word that a contact was verified.
     */
    proof: {
      type: String,
      select: false,
      index: true,
    },
    /** Mongo removes the row itself once this passes. */
    /**
     * The other contact detail typed on the same form, when the client sends
     * it.
     *
     * An email row and a phone row are otherwise unrelated records, so a
     * half-finished signup appeared in the console as two people rather than
     * one. This links them without inventing an account to hold the pair.
     */
    counterpart: {
      type: String,
      trim: true,
      lowercase: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 },
    },
  },
  { timestamps: true }
);

signupVerificationSchema.index({ channel: 1, value: 1 });

const SignupVerification = mongoose.model('SignupVerification', signupVerificationSchema);

export default SignupVerification;
