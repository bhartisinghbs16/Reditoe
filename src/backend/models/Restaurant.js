import mongoose from 'mongoose';

const restaurantSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a restaurant name'],
    trim: true,
  },
  /** The one shown on cards and listings. */
  image: {
    type: String,
    default: '',
  },

  /**
   * Photos of the place, as the vendor uploads them.
   *
   * The onboarding form took a single restaurant photo and filed it with the
   * KYC paperwork, so there was no gallery for a vendor to build and nothing
   * for the admin console to show. Newest last, and `image` is set from the
   * first one so a restaurant is never listed without a picture.
   */
  images: {
    type: [String],
    default: [],
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  deliveryTime: {
    type: String,
    default: '30 min',
  },
  estimatedDeliveryMinutes: {
    type: Number,
    default: 30,
    min: 0,
  },
  currentPrepTimeMinutes: {
    type: Number,
    default: null,
    min: 0,
  },
  deliveryBufferMinutes: {
    type: Number,
    default: 15,
    min: 0,
  },
  lastPrepTimeUpdatedAt: {
    type: Date,
    default: null,
  },
  deliveryFee: {
    type: Number,
    default: 0,
    min: 0,
  },
  dailyPackagingFee: {
    type: Number,
    default: 0,
    min: 0,
  },
  packagingFeeUpdatedAt: {
    type: Date,
    default: null,
  },

  /**
   * What this restaurant is charged, and which of it applies.
   *
   * Each vendor is negotiated with separately - one may be on a promotional
   * commission, another may have packing waived - so every charge carries its
   * own switch and its own figure, and changing one vendor's terms cannot
   * touch another's.
   *
   * Switched on by default: a vendor onboarded before this existed was being
   * charged commission and GST, and defaulting to off would quietly stop
   * billing them.
   */
  /**
   * What this restaurant is charged.
   *
   * Each vendor is negotiated with separately - one on a promotional
   * commission, another with packing waived - so every charge carries its own
   * switch, its own figure, and its own GST rate, and changing one vendor's
   * terms cannot touch another's.
   *
   * Commission and the convenience fee can each be a percentage of the food
   * or a flat rupee amount, because both are agreed both ways in practice.
   * Packing is only ever a flat amount: it is what was collected from the
   * customer on that order, not a share of it.
   *
   * GST is charged on top of every one of them, never folded in - which is
   * what the client asked for and also what a vendor expects to see itemised
   * on a statement they are checking.
   */
  charges: {
    /**
     * Whether anybody has actually set these terms for this restaurant.
     *
     * Mongoose fills the figures below in with defaults on every document,
     * including one saved years before this block existed, so the numbers
     * alone cannot say whether they were chosen or invented. Until an admin
     * sets terms here, the older commissionPercent and the platform's tax
     * settings remain in charge.
     */
    configured: { type: Boolean, default: false },

    commission: {
      enabled: { type: Boolean, default: true },
      /** 'percentage' of the food total, or a flat 'fixed' amount per order. */
      mode: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
      percentage: { type: Number, default: 10, min: 0, max: 100 },
      amount: { type: Number, default: 0, min: 0 },
      gstEnabled: { type: Boolean, default: true },
      gstPercentage: { type: Number, default: 18, min: 0, max: 30 },
    },

    /** The platform's convenience fee, borne by the vendor. */
    convenience: {
      enabled: { type: Boolean, default: false },
      mode: { type: String, enum: ['percentage', 'fixed'], default: 'fixed' },
      percentage: { type: Number, default: 0, min: 0, max: 100 },
      amount: { type: Number, default: 0, min: 0 },
      gstEnabled: { type: Boolean, default: true },
      gstPercentage: { type: Number, default: 18, min: 0, max: 30 },
    },

    /**
     * The packing charge this vendor adds to a customer's bill. Settlement
     * uses what was actually collected on the order rather than this figure -
     * this is the price going forward, the order is the receipt.
     */
    packing: {
      enabled: { type: Boolean, default: false },
      amount: { type: Number, default: 0, min: 0 },
      gstEnabled: { type: Boolean, default: true },
      gstPercentage: { type: Number, default: 18, min: 0, max: 30 },
    },

    /** GST on the food itself, which the platform collects and remits. */
    gst: {
      enabled: { type: Boolean, default: true },
      percentage: { type: Number, default: 5, min: 0, max: 30 },
    },

    /** Kept so terms saved before the GST rates moved onto each charge still read. */
    packingGst: {
      enabled: { type: Boolean, default: false },
      percentage: { type: Number, default: 18, min: 0, max: 30 },
    },
  },
  categories: {
    type: [String],
    default: [],
  },
  isFeatured: {
    type: Boolean,
    default: false,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  /**
   * Where the application has got to.
   *
   * 'correction_requested' sits between pending and rejected: the admin wants
   * something changed but is not turning the vendor away, and the vendor can
   * edit and resubmit. Rejection is the end of that road unless an admin
   * reopens it.
   */
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'correction_requested'],
    default: 'pending', // Default to pending - requires admin approval
  },

  /**
   * Why the last decision went the way it did, and who made it.
   *
   * A vendor told only "rejected" has nothing to act on, and the brief asks
   * for the reason to be shown to them with a way to correct and resubmit.
   */
  statusReason: {
    type: String,
    trim: true,
  },
  statusChangedAt: Date,
  statusChangedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  /** When the vendor last sent the application back for review. */
  submittedAt: Date,

  /**
   * Every decision, oldest first.
   *
   * A disputed rejection needs more than the current state to answer, and an
   * admin picking up someone else's application needs to see what has already
   * been asked for.
   */
  approvalHistory: [
    {
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'correction_requested', 'resubmitted'],
      },
      reason: String,
      /** The admin's name, kept as text so it survives the account. */
      by: String,
      at: { type: Date, default: Date.now },
    },
  ],
  // Multi-tenant organization support
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
  },
  description: {
    type: String,
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
  },
  phone: {
    type: String,
  },
  /**
   * The outlet's reference, as every screen should print it.
   *
   * The vendor app took the last twelve characters of the Mongo id, the admin
   * console took the last eight and put "REST" in front, so the same
   * restaurant was called two different things depending on where you looked
   * - and the vendor's own application number was a third. Minted once and
   * read everywhere after that, so there is one answer.
   */
  outletId: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    trim: true,
  },

  /** Legacy free-text hours ("9am - 11pm"), kept so old records still read. */
  openingHours: {
    type: String,
  },

  /**
   * When the kitchen is actually open, by day and by slot.
   *
   * A restaurant is not open for one unbroken stretch: breakfast, lunch and
   * dinner are separate, with the kitchen shut between them. The old field was
   * a single line of free text, so none of that could be recorded, let alone
   * acted on - and the admin console said outright that opening hours were not
   * stored against a restaurant at all.
   *
   * `closed` is kept separately from an empty slot list so "closed on Sunday"
   * and "nobody has filled Sunday in yet" are different states.
   */
  workingHours: {
    type: [
      new mongoose.Schema(
        {
          day: {
            type: String,
            enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
            required: true,
          },
          closed: { type: Boolean, default: false },
          slots: [
            new mongoose.Schema(
              {
                /** 24-hour "HH:MM", so slots sort and compare as text. */
                opensAt: {
                  type: String,
                  required: true,
                  match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM'],
                },
                closesAt: {
                  type: String,
                  required: true,
                  match: [/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:MM'],
                },
                /** What the slot is for, when the vendor names it. */
                label: { type: String, trim: true },
              },
              { _id: false }
            ),
          ],
        },
        { _id: false }
      ),
    ],
    default: undefined,
  },
  // Advanced vendor management fields
  kycStatus: {
    type: String,
    enum: ['pending', 'under_review', 'approved', 'rejected'],
    default: 'pending',
  },
  commissionPercent: {
    type: Number,
    default: 10,
    min: 0,
    max: 100,
  },
  isEnabled: {
    type: Boolean,
    default: false, // Only enabled when approved by admin
  },
  isApproved: {
    type: Boolean,
    default: true,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  isOpen: {
    type: Boolean,
    default: true,
  },
  deliveryRadius: {
    type: Number,
    default: 5, // km
    min: 0,
  },
  storeTimings: {
    openTime: String,
    closeTime: String,
    holidays: [String],
  },
  bankDetails: {
    accountHolderName: String,
    accountNumber: String,
    ifsc: String,
    bankName: String,
  },
  kycDocuments: {
    aadhaar: String,
    pan: String,
    gst: String,
    fssai: String,
    cancelledCheque: String,
  },
  settlementLock: {
    type: Boolean,
    default: false,
  },
  // Settlement and finance fields
  settlementInfo: {
    defaultFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'weekly',
    },
    minimumThreshold: {
      type: Number,
      default: 100,
      min: 0,
    },
    settlementDay: {
      type: Number,
      min: 1,
      max: 31,
      default: 1, // First day of week/month
    },
    autoSettlement: {
      type: Boolean,
      default: false,
    },
    bankDetails: {
      accountHolderName: String,
      accountNumber: String,
      ifsc: String,
      bankName: String,
      branchName: String,
    },
  },
  gstInfo: {
    gstNumber: String,
    gstPercentage: {
      type: Number,
      default: 5,
      min: 0,
      max: 30,
    },
    isRegistered: {
      type: Boolean,
      default: false,
    },
  },
  // New required fields
  foodLicenseNumber: {
    type: String,
    trim: true,
  },
  storeCharge: {
    type: Number,
    default: 0,
    min: 0,
  },
  upiId: {
    type: String,
    trim: true,
  },
  foodType: {
    type: String,
    enum: ['veg', 'non-veg', 'both'],
    default: 'both',
  },
  vendorOtpEnabled: {
    type: Boolean,
    default: false,
  },
  vendorOtp: {
    type: String,
    select: false, // Don't include in queries by default
  },
  vendorOtpExpires: {
    type: Date,
    select: false,
  },
  documentVerificationStatus: {
    fssaiVerified: {
      type: Boolean,
      default: false,
    },
    gstVerified: {
      type: Boolean,
      default: false,
    },
    bankVerified: {
      type: Boolean,
      default: false,
    },
  },

  /**
   * The compliance file, one record per statutory document.
   *
   * `kycDocuments` above stores a bare URL for five of them and
   * `documentVerificationStatus` a bare boolean for three, which between them
   * cannot answer what the admin console's Documents screen asks: when was this
   * filed, what is its number, when does it expire, who approved it and when,
   * and why was it rejected. Those columns had nowhere to read from and were
   * printing em-dashes; the two extra certificates the screen lists had nowhere
   * to upload to at all.
   *
   * Keyed by the document's own name — fssai, pan, gst, bank, aadhaar, shop,
   * fire, health — so adding a document type does not mean adding a field.
   * `kycDocuments` and `documentVerificationStatus` are still written wherever
   * they have a matching entry, because other screens and the vendor apps read
   * them.
   */
  documentRecords: {
    type: Map,
    of: new mongoose.Schema(
      {
        url: String,
        /** Licence / registration number, when the admin records one. */
        number: String,
        uploadedAt: Date,
        expiryDate: Date,
        status: {
          type: String,
          enum: ['pending', 'verified', 'rejected'],
          default: 'pending',
        },
        /** Who approved or rejected it — a name, so it survives the account. */
        verifiedBy: String,
        verifiedAt: Date,
        /** Why it was rejected, or any note the admin left. */
        note: String,
      },
      { _id: false }
    ),
    default: undefined,
  },

  /**
   * Identity checks run against CGPey. `verifications` is the current state,
   * keyed by service name, so a screen can ask "is the PAN verified" without
   * scanning history. `verificationRecords` is the append-only trail, kept
   * because each check costs money and because a disputed rejection needs more
   * than a boolean to answer.
   *
   * Both must be declared: the schema is strict, so writing to undeclared
   * paths silently drops them and every check would appear to succeed while
   * storing nothing.
   */
  verifications: {
    type: Map,
    of: new mongoose.Schema(
      { verified: Boolean, checkedAt: Date },
      { _id: false }
    ),
    default: undefined,
  },
  verificationRecords: [
    {
      service: String,
      verified: Boolean,
      reference: String,
      checkedAt: Date,
      response: mongoose.Schema.Types.Mixed,
    },
  ],
}, {
  timestamps: true,
  /*
   * Map fields must survive being turned into a response.
   *
   * `toObject()` leaves a Map as a JS Map, and `JSON.stringify(new Map())` is
   * "{}" - so every document record, and every verification, reached the
   * console as an empty object. The console could not show a licence number
   * or an expiry date because it was never sent one, however carefully it
   * had been stored.
   */
  toObject: { flattenMaps: true },
  toJSON: { flattenMaps: true },
});

// Pre-save middleware: Automatically enable restaurant when status becomes approved
restaurantSchema.pre('save', function(next) {
  // Only proceed if status field is being modified
  if (this.isModified('status')) {
    // When status changes to 'approved', automatically set isEnabled to true
    if (this.status === 'approved') {
      this.isEnabled = true;
    }
    // When status changes from 'approved' to something else, disable
    else if (this.status !== 'approved' && this.isEnabled === true) {
      this.isEnabled = false;
    }
  }
  
  // Validate inconsistent state combinations
  if (this.status === 'approved' && !this.isEnabled) {
    this.isEnabled = true; // Auto-correct
  }
  
  if (this.status !== 'approved' && this.isEnabled) {
    this.isEnabled = false; // Auto-correct
  }
  
  next();
});

// Pre-update middleware for findOneAndUpdate operations
restaurantSchema.pre(['findOneAndUpdate', 'updateOne', 'updateMany'], function(next) {
  const update = this.getUpdate();
  
  if (update.status) {
    // When status changes to 'approved', automatically set isEnabled to true
    if (update.status === 'approved') {
      update.isEnabled = true;
    }
    // When status changes from 'approved' to something else, disable
    else if (update.status !== 'approved') {
      update.isEnabled = false;
    }
  }
  
  next();
});

// Database indexes for performance optimization
restaurantSchema.index({ name: 'text', description: 'text', 'address.city': 'text', 'address.street': 'text' });
restaurantSchema.index({ status: 1, isEnabled: 1 });
restaurantSchema.index({ categories: 1 });
restaurantSchema.index({ rating: -1 });
restaurantSchema.index({ isFeatured: -1 });
restaurantSchema.index({ createdAt: -1 });

/**
 * Give a restaurant its outlet reference before it is validated.
 *
 * Derived from the id rather than counted, so it needs no second read and two
 * restaurants created at the same moment cannot collide on it. `unique` on
 * the field is what actually guarantees that.
 */
restaurantSchema.pre('validate', function assignOutletId(next) {
  if (this.isNew && !this.outletId) {
    this.outletId = `RES-${this._id.toString().slice(-8).toUpperCase()}`;
  }
  next();
});

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

export default Restaurant;
