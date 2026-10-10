import mongoose from 'mongoose';

/**
 * One GST registration per state.
 *
 * A business delivering food in India registers for GST in each state it
 * operates in, and the invoice for an order has to carry the registration
 * belonging to the state that order was delivered in. A single platform-wide
 * GSTIN is wrong the moment a second state opens.
 *
 * This is the platform's own registration, not a vendor's. It is what appears
 * on the invoice the customer receives.
 */

const stateGstSchema = new mongoose.Schema(
  {
    stateName: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * The two-digit code that opens every GSTIN issued in that state - 37 for
     * Andhra Pradesh, 29 for Karnataka. Stored as a string because it is an
     * identifier rather than a quantity, and because 07 is not 7.
     */
    stateCode: {
      type: String,
      required: true,
      trim: true,
      match: [/^\d{2}$/, 'State code is two digits'],
    },

    /**
     * 15 characters: two digits of state, ten of PAN, one entity digit, the
     * letter Z, and a checksum character. Validated on shape here; the
     * authority for whether it is real is the GST portal.
     */
    gstin: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: [
        /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z][A-Z\d]$/,
        'That does not look like a GSTIN',
      ],
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    /** The registration applies to orders delivered on or after this date. */
    effectiveFrom: {
      type: Date,
    },

    /** Set when a registration is surrendered or replaced. */
    effectiveTo: {
      type: Date,
    },

    gstType: {
      type: String,
      enum: ['Regular', 'Composition', 'Casual', 'Non-Resident'],
      default: 'Regular',
    },

    /** The address as it appears on the certificate, printed on invoices. */
    address: {
      type: String,
      trim: true,
    },

    /** Where the uploaded certificate lives, if one was provided. */
    certificateUrl: {
      type: String,
      trim: true,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

/**
 * One registration per state, which is what the law allows and what the
 * invoice logic assumes when it looks one up by state.
 */
stateGstSchema.index({ stateName: 1 }, { unique: true });

export default mongoose.model('StateGst', stateGstSchema);
