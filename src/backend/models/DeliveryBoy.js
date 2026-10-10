import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const deliveryBoySchema = new mongoose.Schema({
  // Basic Info
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: [true, 'Vendor ID is required'],
  },
  name: {
    type: String,
    required: [true, 'Please provide a delivery boy name'],
    trim: true,
  },
  riderId: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple null values
  },
  image: {
    type: String,
    default: '',
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending',
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  currentRating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5,
  },
  phone: {
    type: String,
    required: [true, 'Please provide a phone number'],
    unique: true,
    trim: true,
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false,
  },
  otpLoginEnabled: {
    type: Boolean,
    default: false,
  },
  kycStatus: {
    type: String,
    // 'under_review' matches the vendor states: something has been filed but
    // not every required document is decided yet.
    enum: ['pending', 'under_review', 'approved', 'rejected'],
    default: 'pending',
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  perKmCharge: {
    type: Number,
    default: 10,
    min: 0,
  },

  // Vehicle Info
  vehicleType: {
    type: String,
    enum: ['bike', 'scooter', 'car', 'cycle'],
    default: 'bike',
  },
  vehicleName: {
    type: String,
    default: 'Not specified',
  },
  vehicleNumber: {
    type: String,
    trim: true,
  },
  vehicleImage: {
    type: String,
  },
  vehicleRC: {
    type: String,
  },
  licenseImage: {
    type: String,
  },
  insuranceNumber: {
    type: String,
    default: 'Not available',
  },

  // Address Info
  fullAddress: {
    type: String,
    trim: true,
  },
  pincode: {
    type: String,
    trim: true,
  },
  landmark: {
    type: String,
    trim: true,
  },
  location: {
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

  // Commission
  commissionType: {
    type: String,
    enum: ['percentage', 'fixed'],
    required: [true, 'Commission type is required'],
  },
  commissionValue: {
    type: Number,
    required: [true, 'Commission value is required'],
    min: 0,
  },

  // Bank Details (nested object)
  bankDetails: {
    accountHolderName: {
      type: String,
      default: 'Not provided',
    },
    accountNumber: {
      type: String,
      default: 'Not provided',
    },
    ifsc: {
      type: String,
      default: 'Not provided',
    },
    bankName: {
      type: String,
      default: 'Not provided',
    },
    branch: {
      type: String,
      default: 'Not available',
    },
    city: {
      type: String,
      default: 'Not available',
    },
    country: {
      type: String,
      default: 'India',
    },
  },

  // KYC Documents (nested object)
  /**
   * What is known about each document, beyond the file itself.
   *
   * `kycDocuments` below holds only URLs, so a partner's licence number, when
   * it was filed, when it expires and who checked it had nowhere to live.
   * Both are kept: the URLs stay where every existing caller expects them,
   * and the detail hangs here under the same keys vendors use.
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
      default: null,
    },
    drivingLicense: {
      type: String,
      default: null,
    },
    vehicleRC: {
      type: String,
      default: null,
    },
    selfie: {
      type: String,
      default: null,
    },
  },

  // Incentives and Penalties (arrays)
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
      default: '',
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

  // Legacy bank fields (for backward compatibility)
  bankName: {
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
    match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Please provide a valid IFSC code'],
  },
  accountHolderName: {
    type: String,
    trim: true,
  },
  upiId: {
    type: String,
    trim: true,
    match: [/^[\w.-]+@[\w.-]+$/, 'Please provide a valid UPI ID'],
  },
  cancelChequeDocument: {
    type: String,
  },

  // OTP for login
  otp: {
    type: String,
    select: false,
  },
  otpExpires: {
    type: Date,
    select: false,
  },

  // Performance tracking
  totalDeliveries: {
    type: Number,
    default: 0,
    min: 0,
  },
  completedDeliveries: {
    type: Number,
    default: 0,
    min: 0,
  },
  cancelledDeliveries: {
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

  // Current status
  isOnline: {
    type: Boolean,
    default: false,
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
  currentOrderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    default: null,
  },
  deliveryETA: {
    type: Date,
    default: null,
  },

  // Multi-tenant support
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
  },
}, {
  timestamps: true,
  /*
   * The Map above must survive being turned into a response. `toObject()`
   * leaves a Map as a JS Map and `JSON.stringify(new Map())` is "{}", which
   * is how the vendor document records reached the console empty.
   */
  toObject: { flattenMaps: true },
  toJSON: { flattenMaps: true },
});

// Indexes for performance
deliveryBoySchema.index({ vendorId: 1, createdAt: -1 });
deliveryBoySchema.index({ status: 1 });
deliveryBoySchema.index({ isOnline: 1 });
deliveryBoySchema.index({ organizationId: 1 });

// Hash password before saving
deliveryBoySchema.pre('save', async function(next) {
  // Skip hashing if password is not modified or is empty/undefined
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method to compare passwords
deliveryBoySchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) {
    return false; // No password set, can't compare
  }
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to generate OTP
deliveryBoySchema.methods.generateOTP = function() {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  this.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  return otp;
};

// Instance method to verify OTP
deliveryBoySchema.methods.verifyOTP = function(candidateOTP) {
  if (!this.otp || !this.otpExpires) {
    return false;
  }
  if (Date.now() > this.otpExpires) {
    return false; // OTP expired
  }
  return this.otp === candidateOTP;
};

// Instance method to clear OTP
deliveryBoySchema.methods.clearOTP = function() {
  this.otp = undefined;
  this.otpExpires = undefined;
  return this.save();
};

// Instance method to update performance metrics
deliveryBoySchema.methods.updatePerformanceMetrics = function() {
  const total = this.totalDeliveries || 1;
  this.successRate = (this.completedDeliveries / total) * 100;
  return this.save();
};

// Static method to find by vendor
deliveryBoySchema.statics.findByVendor = function(vendorId, options = {}) {
  const filter = { vendorId };
  if (options.status) {
    filter.status = options.status;
  }
  if (options.isOnline !== undefined) {
    filter.isOnline = options.isOnline;
  }
  
  return this.find(filter)
    .sort({ createdAt: -1 })
    .limit(options.limit || 50);
};

// Static method to find available delivery boys
deliveryBoySchema.statics.findAvailable = function(vendorId) {
  return this.find({
    vendorId,
    status: 'active',
    isOnline: true,
    currentOrderId: { $exists: false }
  }).sort({ rating: -1, totalDeliveries: -1 });
};

const DeliveryBoy = mongoose.model('DeliveryBoy', deliveryBoySchema);

export default DeliveryBoy;
