import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const addressSchema = new mongoose.Schema({
  label: {
    type: String,
    enum: ['Home', 'Office', 'Other'],
    required: true,
  },
  street: {
    type: String,
    required: true,
  },
  city: {
    type: String,
    required: true,
  },
  state: {
    type: String,
    required: true,
  },
  zipCode: {
    type: String,
    required: true,
  },
  country: {
    type: String,
    default: 'India',
  },
  coordinates: {
    latitude: Number,
    longitude: Number,
  },
}, {
  _id: true,
});

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true,
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  googleId: {
    type: String,
    sparse: true,
  },
  avatar: {
    type: String,
  },
  password: {
    type: String,
    required: function() {
      // Password not required for vendor auto-creation
      return this.role !== 'vendor' || !this.isVendorAutoCreated;
    },
    minlength: 6,
    select: false,
  },
  phone: {
    type: String,
    required: false,
    trim: true,
  },
  dateOfBirth: {
    type: Date,
    default: null,
  },
  /**
   * Declared twice, once here and once further down with a lower-case enum.
   * Mongoose keeps the last, so the lower-case list was the one in force and
   * anything sending "Male" — which is what the apps show — failed validation
   * with no clue why. One declaration now, and it accepts either case.
   */
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    trim: true,
    set: (value) =>
      typeof value === 'string' && value.length
        ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
        : value,
  },

  /**
   * Asked for on the rider's profile screen, and worth having for somebody
   * who rides for a living. The screen displayed it and offered to edit it,
   * but there was nowhere to keep it, so Mongoose dropped it on every write.
   */
  bloodGroup: {
    type: String,
    trim: true,
    uppercase: true,
    enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''],
  },
  emergencyContactName: {
    type: String,
    trim: true,
  },
  emergencyRelationship: {
    type: String,
    trim: true,
  },
  emergencyContactPhone: {
    type: String,
    trim: true,
  },
  alternativePhone: {
    type: String,
    default: '',
    trim: true,
  },
  profilePhoto: {
    type: String,
    default: '',
  },
  /**
   * Whether the customer has proved they own the address or number they
   * registered with.
   *
   * Deliberately has no default. `false` is written only when an account is
   * created through signup, so every account that predates this — the seeds,
   * anyone already registered — reads `undefined` and is treated as verified.
   * A default of `false` would have locked all of them out at once.
   */
  accountVerified: {
    type: Boolean,
  },

  isProfileComplete: {
    type: Boolean,
    default: false,
  },
  location: {
    type: String,
    trim: true,
  },
  // Rider-specific fields
  riderId: {
    type: String,
    trim: true,
    unique: true,
    sparse: true, // Allow multiple null values
  },
  liveLocation: {
    latitude: Number,
    longitude: Number,
    timestamp: Date,
    accuracy: Number,
    heading: Number,
    speed: Number,
  },
  vehicleType: {
    type: String,
    enum: ['bike', 'scooter', 'car', 'van', 'cycle'],
    trim: true,
  },
  vehicleName: {
    type: String,
    trim: true,
  },
  vehicleBrand: {
    type: String,
    trim: true,
  },
  vehicleModel: {
    type: String,
    trim: true,
  },
  vehicleNumber: {
    type: String,
    trim: true,
  },
  currentRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  onlineHistory: [{
    status: {
      type: Boolean,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  }],
  // Bank details for rider payments
  bankDetails: {
    accountHolderName: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    ifscCode: {
      type: String,
      trim: true,
    },
    bankName: {
      type: String,
      trim: true,
    },
  },
  otp: {
    type: String,
    select: false,
  },
  otpExpires: {
    type: Date,
    select: false,
  },
  // Admin forgot-password (optional; no impact on mobile)
  resetPasswordToken: {
    type: String,
    select: false,
  },
  resetPasswordExpires: {
    type: Date,
    select: false,
  },

  /**
   * Account set-up by invitation.
   *
   * An admin creating a vendor should never handle that vendor's password: it
   * would have to be transmitted somewhere to be useful, and a password an
   * admin has read is not the vendor's alone. Instead the account is created
   * without a usable password and the vendor is emailed a one-time link to
   * choose their own.
   *
   * Only the SHA-256 of the token is stored. The raw token exists in the email
   * and nowhere else, so a copy of this collection does not let anyone take
   * over the pending accounts in it.
   */
  passwordSetupToken: {
    type: String,
    select: false,
  },
  passwordSetupExpires: {
    type: Date,
    select: false,
  },
  /**
   * True between the invitation and the vendor choosing a password. Sign-in is
   * refused while it is set, so the placeholder password cannot be used even
   * if it were somehow guessed.
   */
  mustSetPassword: {
    type: Boolean,
    default: false,
  },
  resetOTP: {
    type: String,
    select: false,
  },
  resetOTPExpiry: {
    type: Date,
    select: false,
  },
  /**
   * Reset-code guessing and resend protection.
   *
   * A six-digit code with unlimited tries is a four-minute brute force, and an
   * unthrottled resend is a way to have us text somebody repeatedly. Attempts
   * reset when a new code is issued; the send time is what the resend cooldown
   * is measured from.
   */
  resetOTPAttempts: {
    type: Number,
    default: 0,
    select: false,
  },
  resetOTPSentAt: {
    type: Date,
    select: false,
  },
  /** Where the current code went, so the UI can say "sent to your mobile". */
  resetOTPChannel: {
    type: String,
    enum: ['email', 'phone'],
    select: false,
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  // Admin profile fields
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  lastLogin: {
    type: Date,
  },
  // Rider management fields (admin-side only)
  kycStatus: {
    type: String,
    // 'under_review' matches the vendor states: filed, not yet decided.
    enum: ['pending', 'under_review', 'approved', 'rejected'],
    default: 'pending',
  },
  /**
   * Why a rider's application was turned down.
   *
   * Shown to the rider, so they have something to act on — "rejected" on its
   * own tells them nothing they can correct.
   */
  kycRejectionReason: {
    type: String,
    trim: true,
  },
  perKmCharge: {
    type: Number,
    default: 10,
    min: 0,
  },
  incentives: [{
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    conditions: {
      type: String,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  penalties: [{
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  bankDetails: {
    accountHolderName: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    ifsc: {
      type: String,
      trim: true,
    },
    bankName: {
      type: String,
      trim: true,
    },
    branch: {
      type: String,
      trim: true,
    },
    upiId: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'rejected'],
      default: 'pending',
    },
    autopayEnabled: {
      type: Boolean,
      default: false,
    },
    autopay: {
      eligible: {
        type: Boolean,
        default: false,
      },
      reason: {
        type: String,
        trim: true,
        default: '',
      },
      lastEvaluatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  /**
   * What is known about each document, beyond the file itself.
   *
   * Riders are stored here or in DeliveryBoy depending on how they signed up,
   * so both need somewhere to keep a document's number, dates, status and who
   * checked it. `kycDocuments` below keeps the URLs where existing callers
   * expect them.
   */
  documentRecords: {
    type: Map,
    of: new mongoose.Schema(
      {
        url: String,
        number: String,
        uploadedAt: Date,
        expiryDate: Date,
        status: {
          type: String,
          enum: ['pending', 'verified', 'rejected'],
          default: 'pending',
        },
        verifiedBy: String,
        verifiedAt: Date,
        note: String,
      },
      { _id: false }
    ),
    default: undefined,
  },

  kycDocuments: {
    aadhaar: {
      type: String,
      trim: true,
    },
    aadhaarFront: {
      type: String,
      trim: true,
    },
    aadhaarBack: {
      type: String,
      trim: true,
    },
    drivingLicense: {
      type: String,
      trim: true,
    },
    pan: {
      type: String,
      trim: true,
    },
    gst: {
      type: String,
      trim: true,
    },
    fssaiLicense: {
      type: String,
      trim: true,
    },
    vehicleRC: {
      type: String,
      trim: true,
    },
    vehiclePhoto: {
      type: String,
      trim: true,
    },
    vehicleInsurance: {
      type: String,
      trim: true,
    },
    pucCertificate: {
      type: String,
      trim: true,
    },
    selfie: {
      type: String,
      trim: true,
    },
    photo: {
      type: String,
      trim: true,
    },
    passbookCancelledCheque: {
      type: String,
      trim: true,
    },
  },
  // Document verification status
  aadhaarVerified: {
    type: Boolean,
    default: false,
  },
  drivingLicenceVerified: {
    type: Boolean,
    default: false,
  },
  vehicleRcVerified: {
    type: Boolean,
    default: false,
  },
  insuranceExpiry: {
    type: Date,
    default: null,
  },
  // Performance tracking fields
  totalTrips: {
    type: Number,
    default: 0,
    min: 0,
  },
  completedTrips: {
    type: Number,
    default: 0,
    min: 0,
  },
  cancelledTrips: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalEarnings: {
    type: Number,
    default: 0,
    min: 0,
  },
  successRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  // Vehicle and tracking fields
  insuranceNumber: {
    type: String,
    trim: true,
  },
  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [0, 0],
    },
  },
  /**
   * When currentLocation was last reported.
   *
   * [0,0] is both the default and a real point in the Gulf of Guinea, so a
   * rider who has never sent a position is indistinguishable from one who is
   * there. This is how the dispatcher tells them apart.
   */
  lastLocationAt: {
    type: Date,
  },
  currentOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
  },
  deliveryETA: {
    type: Date,
  },
  // Additional fields
  role: {
    type: String,
    enum: ['user', 'admin', 'rider', 'vendor'],
    default: 'user',
  },
  isVendorAutoCreated: {
    type: Boolean,
    default: false,
  },
  rbacRole: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    default: null,
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
  },
  walletBalance: {
    type: Number,
    default: 0,
    min: 0,
  },

  /**
   * Two-channel verification for an account an admin created.
   *
   * A vendor or a delivery partner entered into the console by staff has
   * never proved they hold the email address or the phone number typed for
   * them - a mistyped digit produces an account nobody can sign into, and
   * nobody finds out until they try. Both codes have to be confirmed before
   * the account is allowed to work.
   *
   * Absent on accounts that did not come in this way, which is why nothing
   * here has a default: a customer who signed themselves up has already
   * proved their own contact details by receiving a code.
   */
  contactVerification: {
    emailOtp: { type: String, select: false },
    phoneOtp: { type: String, select: false },
    emailVerified: { type: Boolean },
    phoneVerified: { type: Boolean },
    expiresAt: { type: Date },
    /** Set when staff created the account, so the console knows to ask. */
    requiredBy: { type: String, enum: ['admin'] },
  },

  /**
   * Whether this customer may pay cash on delivery.
   *
   * Off by default, and turned on per customer by an admin. Cash is the one
   * method where the platform is owed money after the food has gone, so it is
   * offered to customers the client has decided to trust rather than to
   * everyone. Undefined reads as off.
   */
  codEnabled: {
    type: Boolean,
    default: false,
  },
  savedAddresses: [addressSchema],
  // Which saved address checkout should preselect. Points at a subdocument of
  // savedAddresses above, so it is an id rather than a flag on each entry.
  defaultAddressId: {
    type: mongoose.Schema.Types.ObjectId,
  },
  // Primary location fields for rider
  address: {
    type: String,
    trim: true,
  },
  city: {
    type: String,
    trim: true,
  },
  landmark: {
    type: String,
    trim: true,
  },
  /**
   * Where post should go, when it is not where the rider lives.
   *
   * Kept whole rather than as a flag, because a flag only says the two were
   * the same on the day it was ticked: the rider moves, the home address is
   * corrected, and the postal address silently follows it somewhere nobody
   * chose. The form resolves the checkbox and sends whichever address the
   * rider meant.
   */
  communicationAddress: {
    address: { type: String, trim: true },
    city: { type: String, trim: true },
    landmark: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    sameAsPermanent: { type: Boolean, default: true },
  },
  emergencyContactName: {
    type: String,
    trim: true,
  },
  emergencyRelationship: {
    type: String,
    trim: true,
  },
  emergencyContactPhone: {
    type: String,
    trim: true,
  },
  state: {
    type: String,
    trim: true,
  },
  pincode: {
    type: String,
    trim: true,
  },
  // Referral system fields
  referralCode: {
    type: String,
    unique: true,
    sparse: true, // Allow multiple null values
    trim: true,
    uppercase: true,
  },
  referredBy: {
    type: String,
    trim: true,
    uppercase: true,
  },
  referralEarnings: {
    type: Number,
    default: 0,
    min: 0,
  },
  totalReferrals: {
    type: Number,
    default: 0,
    min: 0,
  },
  firstOrderCompleted: {
    type: Boolean,
    default: false,
  },
  // Push notification tokens
  fcmTokens: [{
    token: {
      type: String,
      required: true,
      trim: true
    },
    deviceInfo: {
      platform: {
        type: String,
        enum: ['android', 'ios', 'web', 'unknown'],
        default: 'unknown'
      },
      version: String,
      deviceId: String,
      model: String,
      manufacturer: String
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastUsed: {
      type: Date,
      default: Date.now
    }
  }],
  lastActiveAt: {
    type: Date,
    default: Date.now
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

// Hash password before saving
/**
 * Two-step sign-in for admin accounts.
 *
 * The secret never leaves the server after enrolment and is not returned by
 * an ordinary query - `select: false` means a controller has to ask for it on
 * purpose, so it cannot be leaked by a route that simply returns the user.
 *
 * `pending` holds a secret that has been shown as a QR code but not yet
 * proved. Nothing is switched on until the person has typed a code from their
 * phone, so a half-finished setup cannot lock anybody out.
 */
userSchema.add({
  twoFactor: {
    enabled: { type: Boolean, default: false },
    secret: { type: String, select: false },
    pending: { type: String, select: false },
    enrolledAt: { type: Date, default: null },
    /**
     * Single-use codes for the day the phone is lost, stored hashed for the
     * same reason passwords are: whoever reads the database should not be
     * able to walk in with them.
     */
    recoveryCodes: {
      type: [
        {
          _id: false,
          hash: String,
          usedAt: { type: Date, default: null },
        },
      ],
      select: false,
      default: [],
    },
  },
});

userSchema.pre('save', async function(next) {
  // Skip hashing if password is not modified or is empty/undefined
  if (!this.isModified('password') || !this.password) return next();
  
  // Check if password is already hashed (bcrypt hashes start with $2b$ or $2a$)
  if (this.password.startsWith('$2')) {
    return next(); // Password is already hashed
  }
  
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Generate referral code for new users
userSchema.pre('save', async function(next) {
  // Only generate referral code for new users who don't have one
  if (this.isNew && !this.referralCode && this.role === 'user') {
    // Generate unique referral code
    const generateReferralCode = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return code;
    };

    // Ensure uniqueness
    let referralCode = generateReferralCode();
    let codeExists = await this.constructor.findOne({ referralCode });
    
    while (codeExists) {
      referralCode = generateReferralCode();
      codeExists = await this.constructor.findOne({ referralCode });
    }

    this.referralCode = referralCode;
  }
  
  next();
});

// Instance method to compare passwords
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false; // No password set, can't compare
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
