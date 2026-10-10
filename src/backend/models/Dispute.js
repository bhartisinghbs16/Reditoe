import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  senderType: {
    type: String,
    enum: ['customer', 'vendor', 'rider', 'admin'],
    required: true,
  },
  message: {
    type: String,
    required: true,
    trim: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  isInternal: {
    type: Boolean,
    default: false, // Internal notes visible only to admins
  },
}, {
  _id: true,
});

const evidenceSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['image', 'document', 'text'],
    required: true,
  },
  url: String,
  description: String,
  text: String, // For text evidence
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  uploadedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  _id: true,
});

const disputeSchema = new mongoose.Schema({
  disputeId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: [true, 'Dispute must be associated with an order'],
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['customer', 'vendor', 'rider'],
      required: true,
    },
    involved: {
      type: Boolean,
      default: true,
    },
  }],
  initiatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Dispute must have an initiator'],
  },
  initiatorRole: {
    type: String,
    enum: ['customer', 'vendor', 'rider'],
    required: true,
  },
  disputeType: {
    type: String,
    enum: [
      'order_quality', // Food quality issues
      'delivery_issue', // Delivery problems
      'payment_dispute', // Payment related
      'service_complaint', // Service quality
      'refund_request', // Refund related
      'other', // Other issues
    ],
    required: true,
  },
  title: {
    type: String,
    required: [true, 'Dispute title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters'],
  },
  description: {
    type: String,
    required: [true, 'Dispute description is required'],
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters'],
  },
  status: {
    type: String,
    enum: ['open', 'under_review', 'resolved', 'rejected'],
    default: 'open',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Admin assigned to handle dispute
  },
  resolution: {
    decision: {
      type: String,
      enum: ['favor_customer', 'favor_vendor', 'favor_rider', 'compromise', 'rejected'],
    },
    description: {
      type: String,
      trim: true,
    },
    actionTaken: {
      type: String,
      trim: true,
    },
    refundAmount: {
      type: Number,
      min: 0,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: {
      type: Date,
    },
  },
  messages: [messageSchema],
  evidence: [evidenceSchema],
  timeline: [{
    status: {
      type: String,
      enum: ['open', 'under_review', 'resolved', 'rejected'],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    message: {
      type: String,
      trim: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  }],
  tags: [{
    type: String,
    trim: true,
  }],
  escalated: {
    type: Boolean,
    default: false,
  },
  escalatedAt: Date,
  escalatedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  satisfactionRating: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    feedback: {
      type: String,
      trim: true,
    },
    ratedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    ratedAt: {
      type: Date,
    },
  },
  // Organization support
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
  },
}, {
  timestamps: true,
});

// Indexes for efficient queries
disputeSchema.index({ orderId: 1 });
disputeSchema.index({ participants: 1 });
disputeSchema.index({ initiatorId: 1 });
disputeSchema.index({ status: 1 });
disputeSchema.index({ priority: 1 });
disputeSchema.index({ disputeType: 1 });
disputeSchema.index({ createdAt: -1 });
disputeSchema.index({ assignedTo: 1 });
disputeSchema.index({ organizationId: 1 });

// Auto-generate disputeId before saving
disputeSchema.pre('save', async function(next) {
  if (this.isNew && !this.disputeId) {
    const count = await this.constructor.countDocuments();
    this.disputeId = `DSP${String(count + 1).padStart(6, '0')}`;
  }
  
  // Add initial timeline entry
  if (this.isNew && this.timeline.length === 0) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      message: `Dispute opened: ${this.title}`,
      updatedBy: this.initiatorId,
    });
  }
  
  next();
});

// Virtual for checking if dispute is active
disputeSchema.virtual('isActive').get(function() {
  return ['open', 'under_review'].includes(this.status);
});

// Virtual for dispute duration
disputeSchema.virtual('duration').get(function() {
  const now = new Date();
  const created = new Date(this.createdAt);
  return Math.floor((now - created) / (1000 * 60 * 60 * 24)); // Days
});

// Method to add message
disputeSchema.methods.addMessage = function(senderId, senderType, message, isInternal = false) {
  this.messages.push({
    senderId,
    senderType,
    message: message.trim(),
    timestamp: new Date(),
    isInternal,
  });
  return this.save();
};

// Method to update status
disputeSchema.methods.updateStatus = function(newStatus, updatedBy, message = '') {
  const oldStatus = this.status;
  this.status = newStatus;
  
  this.timeline.push({
    status: newStatus,
    timestamp: new Date(),
    message: message || `Status changed from ${oldStatus} to ${newStatus}`,
    updatedBy,
  });
  
  return this.save();
};

// Method to resolve dispute
disputeSchema.methods.resolve = function(resolution, resolvedBy) {
  this.resolution = {
    ...resolution,
    resolvedBy,
    resolvedAt: new Date(),
  };
  this.status = 'resolved';
  
  this.timeline.push({
    status: 'resolved',
    timestamp: new Date(),
    message: `Dispute resolved: ${resolution.description}`,
    updatedBy: resolvedBy,
  });
  
  return this.save();
};

// Method to add evidence
disputeSchema.methods.addEvidence = function(evidence) {
  this.evidence.push({
    ...evidence,
    uploadedAt: new Date(),
  });
  return this.save();
};

const Dispute = mongoose.model('Dispute', disputeSchema);

export default Dispute;
