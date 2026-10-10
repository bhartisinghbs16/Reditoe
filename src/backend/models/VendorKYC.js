/**
 * Vendor KYC Model
 * Handles Know Your Customer verification for vendors
 * Tracks document uploads, verification status, and approval workflow
 */

import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['aadhaar', 'pan', 'gst', 'fssai', 'cancelledCheque', 'addressProof', 'photo'],
    required: true,
  },
  url: {
    type: String,
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
  verifiedAt: {
    type: Date,
  },
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending',
  },
  rejectionReason: {
    type: String,
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  fileSize: {
    type: Number,
  },
  mimeType: {
    type: String,
  },
});

const kycSchema = new mongoose.Schema({
  vendorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Restaurant',
    required: true,
  },
  
  // Personal Information
  personalInfo: {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    dateOfBirth: {
      type: Date,
      required: true,
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    address: {
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
      pinCode: {
        type: String,
        required: true,
      },
      country: {
        type: String,
        default: 'India',
      },
    },
  },

  // Business Information
  businessInfo: {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    businessType: {
      type: String,
      enum: ['proprietorship', 'partnership', 'private_limited', 'public_limited', 'llp'],
      required: true,
    },
    panNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    gstNumber: {
      type: String,
      uppercase: true,
      trim: true,
    },
    fssaiLicense: {
      type: String,
      trim: true,
    },
    businessAddress: {
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
      pinCode: {
        type: String,
        required: true,
      },
      country: {
        type: String,
        default: 'India',
      },
    },
  },

  // Bank Information
  bankInfo: {
    accountHolderName: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },
    ifscCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    branchName: {
      type: String,
      required: true,
      trim: true,
    },
    accountType: {
      type: String,
      enum: ['savings', 'current'],
      required: true,
    },
  },

  // Documents
  documents: [documentSchema],

  // Verification Status
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'submitted', 'under_review', 'verified', 'rejected'],
    default: 'not_started',
  },

  // Verification Timeline
  submittedAt: {
    type: Date,
  },
  reviewedAt: {
    type: Date,
  },
  verifiedAt: {
    type: Date,
  },
  rejectedAt: {
    type: Date,
  },

  // Review Information
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  reviewNotes: {
    type: String,
  },
  rejectionReasons: [{
    type: String,
  }],

  // Compliance Checks
  complianceChecks: {
    aadhaarVerified: {
      type: Boolean,
      default: false,
    },
    panVerified: {
      type: Boolean,
      default: false,
    },
    gstVerified: {
      type: Boolean,
      default: false,
    },
    fssaiVerified: {
      type: Boolean,
      default: false,
    },
    bankVerified: {
      type: Boolean,
      default: false,
    },
  },

  // Additional Information
  additionalInfo: {
    type: String,
  },
  termsAccepted: {
    type: Boolean,
    default: false,
  },
  privacyPolicyAccepted: {
    type: Boolean,
    default: false,
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes for better performance
kycSchema.index({ restaurantId: 1 });
kycSchema.index({ status: 1 });
kycSchema.index({ submittedAt: 1 });
kycSchema.index({ reviewedAt: 1 });

// Pre-save middleware
kycSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Static methods
kycSchema.statics.findByVendorId = function(vendorId) {
  return this.findOne({ vendorId }).populate('vendorId', 'name email phone');
};

kycSchema.statics.findByStatus = function(status) {
  return this.find({ status }).populate('vendorId', 'name email phone');
};

kycSchema.statics.findPendingReview = function() {
  return this.find({ status: 'submitted' }).populate('vendorId', 'name email phone');
};

// Instance methods
kycSchema.methods.getRequiredDocuments = function() {
  const requiredDocs = ['aadhaar', 'pan', 'cancelledCheque', 'photo'];
  const uploadedDocs = this.documents.map(doc => doc.type);
  
  return requiredDocs.filter(doc => !uploadedDocs.includes(doc));
};

kycSchema.methods.isComplete = function() {
  const requiredDocs = this.getRequiredDocuments();
  return requiredDocs.length === 0 && 
         this.personalInfo && 
         this.businessInfo && 
         this.bankInfo &&
         this.termsAccepted &&
         this.privacyPolicyAccepted;
};

kycSchema.methods.canSubmit = function() {
  return this.isComplete() && this.status === 'in_progress';
};

kycSchema.methods.submitForReview = function() {
  if (!this.canSubmit()) {
    throw new Error('KYC is not complete or cannot be submitted');
  }
  
  this.status = 'submitted';
  this.submittedAt = new Date();
  return this.save();
};

kycSchema.methods.approveKYC = function(reviewedBy, notes) {
  this.status = 'verified';
  this.reviewedBy = reviewedBy;
  this.reviewNotes = notes;
  this.reviewedAt = new Date();
  this.verifiedAt = new Date();
  
  // Mark all documents as verified
  this.documents.forEach(doc => {
    doc.status = 'verified';
    doc.verifiedAt = new Date();
    doc.verifiedBy = reviewedBy;
  });
  
  return this.save();
};

kycSchema.methods.rejectKYC = function(reviewedBy, reasons, notes) {
  this.status = 'rejected';
  this.reviewedBy = reviewedBy;
  this.rejectionReasons = reasons;
  this.reviewNotes = notes;
  this.reviewedAt = new Date();
  this.rejectedAt = new Date();
  
  return this.save();
};

kycSchema.methods.addDocument = function(documentData) {
  // Check if document type already exists
  const existingDocIndex = this.documents.findIndex(doc => doc.type === documentData.type);
  
  if (existingDocIndex >= 0) {
    // Update existing document
    this.documents[existingDocIndex] = {
      ...this.documents[existingDocIndex].toObject(),
      ...documentData,
      uploadedAt: new Date(),
      status: 'pending',
      verifiedAt: undefined,
      verifiedBy: undefined,
      rejectionReason: undefined,
    };
  } else {
    // Add new document
    this.documents.push({
      ...documentData,
      uploadedAt: new Date(),
    });
  }
  
  // Update status if this is the first document
  if (this.status === 'not_started') {
    this.status = 'in_progress';
  }
  
  return this.save();
};

kycSchema.methods.verifyDocument = function(documentType, verifiedBy, status = 'verified', rejectionReason) {
  const docIndex = this.documents.findIndex(doc => doc.type === documentType);
  
  if (docIndex >= 0) {
    this.documents[docIndex].status = status;
    this.documents[docIndex].verifiedAt = new Date();
    this.documents[docIndex].verifiedBy = verifiedBy;
    
    if (status === 'rejected') {
      this.documents[docIndex].rejectionReason = rejectionReason;
    }
    
    // Update compliance checks
    this.complianceChecks[`${documentType}Verified`] = (status === 'verified');
    
    return this.save();
  }
  
  throw new Error(`Document of type ${documentType} not found`);
};

kycSchema.methods.getProgress = function() {
  const totalSteps = 5; // Personal Info, Business Info, Bank Info, Documents, Review
  let completedSteps = 0;
  
  if (this.personalInfo && Object.keys(this.personalInfo).length > 0) completedSteps++;
  if (this.businessInfo && Object.keys(this.businessInfo).length > 0) completedSteps++;
  if (this.bankInfo && Object.keys(this.bankInfo).length > 0) completedSteps++;
  if (this.documents && this.documents.length > 0) completedSteps++;
  if (this.status === 'submitted' || this.status === 'under_review' || this.status === 'verified') completedSteps++;
  
  return Math.round((completedSteps / totalSteps) * 100);
};

const VendorKYC = mongoose.model('VendorKYC', kycSchema);

export default VendorKYC;
