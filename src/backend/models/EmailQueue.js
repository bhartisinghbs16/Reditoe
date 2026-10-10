/**
 * Email Queue model for managing email sending
 * Additive only - does not modify existing functionality
 */
import mongoose from 'mongoose';

const emailQueueSchema = new mongoose.Schema({
  // Email details
  to: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  cc: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  bcc: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  // Template and content
  templateName: {
    type: String,
    required: true
  },
  templateData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  subject: {
    type: String,
    required: true
  },
  htmlContent: {
    type: String,
    required: true
  },
  textContent: {
    type: String,
    required: true
  },
  
  // Sending configuration
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  scheduledAt: {
    type: Date,
    default: Date.now
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'processing', 'sent', 'failed', 'cancelled'],
    default: 'pending'
  },
  
  // Delivery tracking
  attempts: {
    type: Number,
    default: 0
  },
  maxAttempts: {
    type: Number,
    default: 3
  },
  lastAttemptAt: Date,
  sentAt: Date,
  
  // Error handling
  errorMessage: String,
  errorDetails: mongoose.Schema.Types.Mixed,
  
  // Provider information
  provider: {
    type: String,
    enum: ['sendgrid', 'ses', 'mailgun', 'smtp'],
    default: 'sendgrid'
  },
  providerMessageId: String,
  
  // Metadata
  category: {
    type: String,
    enum: ['account', 'order', 'payment', 'marketing', 'notification', 'system'],
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  
  // Tracking and analytics
  openedAt: Date,
  clickedAt: Date,
  bouncedAt: Date,
  complainedAt: Date,
  
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for performance
emailQueueSchema.index({ status: 1, scheduledAt: 1 });
emailQueueSchema.index({ priority: 1, status: 1, scheduledAt: 1 });
emailQueueSchema.index({ to: 1 });
emailQueueSchema.index({ templateName: 1 });
emailQueueSchema.index({ category: 1 });
emailQueueSchema.index({ organizationId: 1 });
emailQueueSchema.index({ providerMessageId: 1 });

// Instance methods
emailQueueSchema.methods.markAsProcessing = function() {
  this.status = 'processing';
  this.attempts += 1;
  this.lastAttemptAt = new Date();
  return this.save();
};

emailQueueSchema.methods.markAsSent = function(providerMessageId) {
  this.status = 'sent';
  this.sentAt = new Date();
  this.providerMessageId = providerMessageId;
  this.errorMessage = null;
  this.errorDetails = null;
  return this.save();
};

emailQueueSchema.methods.markAsFailed = function(errorMessage, errorDetails) {
  this.status = this.attempts >= this.maxAttempts ? 'failed' : 'pending';
  this.errorMessage = errorMessage;
  this.errorDetails = errorDetails;
  return this.save();
};

emailQueueSchema.methods.markAsCancelled = function() {
  this.status = 'cancelled';
  return this.save();
};

emailQueueSchema.methods.canRetry = function() {
  return this.status === 'pending' && this.attempts < this.maxAttempts;
};

emailQueueSchema.methods.shouldRetry = function() {
  if (!this.canRetry()) return false;
  
  // Calculate retry delay based on attempts (exponential backoff)
  const retryDelay = Math.min(300 * Math.pow(2, this.attempts - 1), 3600); // Max 1 hour
  const nextAttemptTime = new Date(this.lastAttemptAt.getTime() + retryDelay * 1000);
  
  return new Date() >= nextAttemptTime;
};

emailQueueSchema.methods.trackOpen = function() {
  this.openedAt = new Date();
  return this.save();
};

emailQueueSchema.methods.trackClick = function() {
  this.clickedAt = new Date();
  return this.save();
};

emailQueueSchema.methods.trackBounce = function() {
  this.bouncedAt = new Date();
  this.status = 'failed';
  return this.save();
};

emailQueueSchema.methods.trackComplaint = function() {
  this.complainedAt = new Date();
  this.status = 'failed';
  return this.save();
};

// Static methods
emailQueueSchema.statics.addToQueue = function(emailData) {
  const queueItem = new this(emailData);
  return queueItem.save();
};

emailQueueSchema.statics.getPendingEmails = function(limit = 100) {
  return this.find({
    status: 'pending',
    scheduledAt: { $lte: new Date() }
  })
  .sort({ priority: -1, scheduledAt: 1 })
  .limit(limit);
};

emailQueueSchema.statics.getRetryableEmails = function(limit = 50) {
  return this.find({
    status: 'pending',
    attempts: { $gt: 0 },
    attempts: { $lt: this.maxAttempts }
  })
  .sort({ priority: -1, lastAttemptAt: 1 })
  .limit(limit);
};

emailQueueSchema.statics.getEmailStats = function(startDate, endDate, organizationId = null) {
  const filter = {
    createdAt: {
      $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      $lte: endDate || new Date()
    }
  };
  
  if (organizationId) {
    filter.organizationId = organizationId;
  }
  
  return this.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAttempts: { $sum: '$attempts' }
      }
    },
    {
      $group: {
        _id: null,
        stats: {
          $push: {
            status: '$_id',
            count: '$count',
            totalAttempts: '$totalAttempts'
          }
        },
        totalEmails: { $sum: '$count' },
        totalAttempts: { $sum: '$totalAttempts' }
      }
    }
  ]);
};

emailQueueSchema.statics.getEmailsByCategory = function(startDate, endDate, organizationId = null) {
  const filter = {
    createdAt: {
      $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      $lte: endDate || new Date()
    }
  };
  
  if (organizationId) {
    filter.organizationId = organizationId;
  }
  
  return this.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$category',
        sent: {
          $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
        },
        total: { $sum: 1 }
      }
    },
    { $sort: { total: -1 } }
  ]);
};

emailQueueSchema.statics.getDeliveryRate = function(startDate, endDate, organizationId = null) {
  const filter = {
    createdAt: {
      $gte: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      $lte: endDate || new Date()
    }
  };
  
  if (organizationId) {
    filter.organizationId = organizationId;
  }
  
  return this.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        sent: {
          $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        opened: {
          $sum: { $cond: [{ $ne: ['$openedAt', null] }, 1, 0] }
        },
        clicked: {
          $sum: { $cond: [{ $ne: ['$clickedAt', null] }, 1, 0] }
        }
      }
    },
    {
      $project: {
        deliveryRate: {
          $multiply: [
            { $divide: ['$sent', '$total'] },
            100
          ]
        },
        openRate: {
          $multiply: [
            { $divide: ['$opened', '$sent'] },
            100
          ]
        },
        clickRate: {
          $multiply: [
            { $divide: ['$clicked', '$sent'] },
            100
          ]
        },
        total: 1,
        sent: 1,
        failed: 1
      }
    }
  ]);
};

const EmailQueue = mongoose.model('EmailQueue', emailQueueSchema);

export default EmailQueue;
