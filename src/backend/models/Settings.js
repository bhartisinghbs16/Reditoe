/**
 * System Settings model for admin configuration and foundation controls
 * Centralized settings for delivery charges, cancellation policy, taxes, app versions, and CMS pages
 */
import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  // Delivery Charges Configuration
  deliveryCharges: {
    defaultCharge: {
      type: Number,
      default: 40,
      min: 0,
    },
    chargeType: {
      type: String,
      enum: ['flat', 'per_km'],
      default: 'flat',
    },
    perKmCharge: {
      type: Number,
      default: 10,
      min: 0,
    },
    freeDeliveryThreshold: {
      type: Number,
      default: 0,
      min: 0,
    },
    vendorSpecificCharges: [{
      restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant',
      },
      charge: {
        type: Number,
        min: 0,
      },
      chargeType: {
        type: String,
        enum: ['flat', 'per_km'],
        default: 'flat',
      },
    }],
  },
  /*
   * Delivery is charged as a flat fee up to `thresholdKm`, then `perKmExtra`
   * for every started kilometre beyond it. The client's worked example: 3km
   * threshold at 30, 10 per extra km, so a 5km delivery is 30 + 2x10 = 50.
   * These defaults match that; the admin console can change them.
   */
  distancePricing: {
    distanceEnabled: {
      type: Boolean,
      default: true,
    },
    thresholdKm: {
      type: Number,
      default: 3,
      min: 0,
    },
    baseFee: {
      type: Number,
      default: 30,
      min: 0,
    },
    perKmExtra: {
      type: Number,
      default: 10,
      min: 0,
    },
    maxDeliveryKm: {
      type: Number,
      default: null,
      min: 0,
    },
    maxDeliveryFee: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  riderDispatch: {
    riderDispatchRadiusKm: {
      type: Number,
      default: 2,
      min: 0.1,
      max: 50,
    },
    requestExpirySeconds: {
      type: Number,
      default: 60,
      min: 10,
      max: 600,
    },
  },

  // Cancellation Policy Configuration
  cancellationPolicy: {
    freeCancellationWindow: {
      type: Number, // in minutes
      default: 5,
      min: 0,
    },
    lateCancellationFee: {
      type: Number,
      default: 20,
      min: 0,
    },
    feeType: {
      type: String,
      enum: ['fixed', 'percentage'],
      default: 'fixed',
    },
    feePercentage: {
      type: Number,
      default: 10,
      min: 0,
      max: 100,
    },
    vendorSpecificPolicies: [{
      restaurantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Restaurant',
      },
      freeCancellationWindow: {
        type: Number,
        min: 0,
      },
      lateCancellationFee: {
        type: Number,
        min: 0,
      },
      feeType: {
        type: String,
        enum: ['fixed', 'percentage'],
        default: 'fixed',
      },
      feePercentage: {
        type: Number,
        min: 0,
        max: 100,
      },
    }],
  },

  // Tax Configuration
  taxConfiguration: {
    gst: {
      enabled: {
        type: Boolean,
        default: true,
      },
      percentage: {
        type: Number,
        default: 5,
        min: 0,
        max: 30,
      },
      cgstPercentage: {
        type: Number,
        default: 2.5,
        min: 0,
        max: 15,
      },
      sgstPercentage: {
        type: Number,
        default: 2.5,
        min: 0,
        max: 15,
      },
    },
    serviceTax: {
      enabled: {
        type: Boolean,
        default: false,
      },
      percentage: {
        type: Number,
        default: 10,
        min: 0,
        max: 30,
      },
    },
    vat: {
      enabled: {
        type: Boolean,
        default: false,
      },
      percentage: {
        type: Number,
        default: 5,
        min: 0,
        max: 30,
      },
    },
    platformFee: {
      enabled: {
        type: Boolean,
        default: true,
      },
      type: {
        type: String,
        enum: ['fixed', 'percentage'],
        default: 'fixed',
      },
      amount: {
        type: Number,
        default: 5,
        min: 0,
      },
      percentage: {
        type: Number,
        default: 2,
        min: 0,
        max: 20,
      },
    },
  },

  // App Version Control
  appVersionControl: {
    currentVersions: {
      ios: {
        version: {
          type: String,
          default: '1.0.0',
        },
        buildNumber: {
          type: String,
          default: '1',
        },
        mandatory: {
          type: Boolean,
          default: false,
        },
        releaseNotes: {
          type: String,
          default: '',
        },
      },
      android: {
        version: {
          type: String,
          default: '1.0.0',
        },
        buildNumber: {
          type: String,
          default: '1',
        },
        mandatory: {
          type: Boolean,
          default: false,
        },
        releaseNotes: {
          type: String,
          default: '',
        },
      },
    },
    versionHistory: [{
      platform: {
        type: String,
        enum: ['ios', 'android'],
        required: true,
      },
      version: {
        type: String,
        required: true,
      },
      buildNumber: {
        type: String,
        required: true,
      },
      releaseDate: {
        type: Date,
        default: Date.now,
      },
      mandatory: {
        type: Boolean,
        default: false,
      },
      releaseNotes: {
        type: String,
      },
      isActive: {
        type: Boolean,
        default: true,
      },
    }],
  },

  // CMS Pages
  cmsPages: {
    aboutUs: {
      title: {
        type: String,
        default: 'About Us',
      },
      content: {
        type: String,
        default: '',
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    termsAndConditions: {
      title: {
        type: String,
        default: 'Terms & Conditions',
      },
      content: {
        type: String,
        default: '',
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    privacyPolicy: {
      title: {
        type: String,
        default: 'Privacy Policy',
      },
      content: {
        type: String,
        default: '',
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
    faq: {
      title: {
        type: String,
        default: 'Frequently Asked Questions',
      },
      content: {
        type: String,
        default: '',
      },
      lastUpdated: {
        type: Date,
        default: Date.now,
      },
      updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    },
  },

  walletSettings: {
    enabled: {
      type: Boolean,
      default: false,
    },
    /**
     * How much of an order the wallet may cover. Ten percent by the client's
     * rule: the wallet is a sweetener on an order, not a way to pay for one.
     */
    maxUsagePercentage: {
      type: Number,
      default: 10,
      min: 0,
      max: 100,
    },
  },

  referralSettings: {
    enabled: {
      type: Boolean,
      default: false,
    },
    referrerAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    userReferralAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    vendorReferralAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryReferralAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    refereeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    creditAfterDelivery: {
      type: Boolean,
      default: true,
    },
  },
  // Audit Trail
  auditTrail: [{
    action: {
      type: String,
      required: true,
    },
    section: {
      type: String,
      required: true,
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  }],
}, {
  timestamps: true,
});

// Add method to update audit trail
settingsSchema.methods.addAuditEntry = function(action, section, changes, userId, ipAddress, userAgent) {
  this.auditTrail.push({
    action,
    section,
    changes,
    updatedBy: userId,
    ipAddress,
    userAgent,
  });
  return this.save();
};

// Static method to get singleton settings
settingsSchema.statics.getSettings = async function() {
  try {
    let settings = await this.findOne();
    if (!settings) {
      settings = new this();
      await settings.save();
    }
    return settings;
  } catch (error) {
    // If database connection fails, return default settings
    return new this();
  }
};

const Settings = mongoose.model('Settings', settingsSchema);

export default Settings;
