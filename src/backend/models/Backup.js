/**
 * Backup model for tracking MongoDB backups
 * Additive only - does not modify existing functionality
 */
import mongoose from 'mongoose';

const backupSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['manual', 'scheduled', 'emergency'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  description: {
    type: String,
    required: true
  },
  
  // Backup configuration
  config: {
    includeCollections: [{
      type: String,
      default: '*' // All collections by default
    }],
    excludeCollections: [{
      type: String,
      default: []
    }],
    compress: {
      type: Boolean,
      default: true
    },
    encryption: {
      enabled: {
        type: Boolean,
        default: false
      },
      algorithm: {
        type: String,
        enum: ['AES256', 'AES128'],
        default: 'AES256'
      }
    }
  },
  
  // Storage configuration
  storage: {
    type: {
      type: String,
      enum: ['local', 's3', 'gcp', 'azure'],
      required: true
    },
    config: {
      // S3 specific
      bucket: String,
      region: String,
      accessKeyId: String,
      secretAccessKey: String,
      
      // GCP specific
      projectId: String,
      keyFilename: String,
      
      // Azure specific
      accountName: String,
      accountKey: String,
      containerName: String,
      
      // Local specific
      path: String
    }
  },
  
  // Backup execution details
  execution: {
    startedAt: Date,
    completedAt: Date,
    duration: Number, // in seconds
    triggeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    errorMessage: String,
    errorDetails: mongoose.Schema.Types.Mixed
  },
  
  // Backup results
  results: {
    fileSize: Number, // in bytes
    fileCount: Number,
    documentCount: Number,
    collectionCount: Number,
    checksum: String, // MD5 or SHA256 hash
    location: String, // Storage location/path
    downloadUrl: String // Temporary download URL
  },
  
  // Retention policy
  retention: {
    days: {
      type: Number,
      default: 30
    },
    autoDelete: {
      type: Boolean,
      default: true
    }
  },
  
  // Scheduling information
  schedule: {
    frequency: {
      type: String,
      enum: ['once', 'daily', 'weekly', 'monthly'],
      default: 'once'
    },
    nextRun: Date,
    lastRun: Date,
    cronExpression: String
  },
  
  // Metadata
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  tags: [{
    type: String,
    trim: true
  }],
  metadata: {
    mongoose: {
      version: String,
      host: String,
      port: Number,
      database: String
    },
    application: {
      version: String,
      environment: String
    }
  }
}, {
  timestamps: true
});

// Indexes for performance
backupSchema.index({ status: 1, createdAt: -1 });
backupSchema.index({ type: 1, createdAt: -1 });
backupSchema.index({ organizationId: 1, createdAt: -1 });
backupSchema.index({ 'schedule.nextRun': 1 });

// Instance methods
backupSchema.methods.start = function(userId) {
  this.status = 'running';
  this.execution.startedAt = new Date();
  this.execution.triggeredBy = userId;
  return this.save();
};

backupSchema.methods.complete = function(results) {
  this.status = 'completed';
  this.execution.completedAt = new Date();
  this.execution.duration = Math.floor((this.execution.completedAt - this.execution.startedAt) / 1000);
  this.results = { ...this.results, ...results };
  this.schedule.lastRun = new Date();
  
  // Set next run if scheduled
  if (this.schedule.frequency !== 'once') {
    this.schedule.nextRun = calculateNextRun(this.schedule.frequency);
  }
  
  return this.save();
};

backupSchema.methods.fail = function(errorMessage, errorDetails) {
  this.status = 'failed';
  this.execution.completedAt = new Date();
  this.execution.duration = Math.floor((this.execution.completedAt - this.execution.startedAt) / 1000);
  this.execution.errorMessage = errorMessage;
  this.execution.errorDetails = errorDetails;
  return this.save();
};

backupSchema.methods.cancel = function() {
  this.status = 'cancelled';
  this.execution.completedAt = new Date();
  if (this.execution.startedAt) {
    this.execution.duration = Math.floor((this.execution.completedAt - this.execution.startedAt) / 1000);
  }
  return this.save();
};

// Static methods
backupSchema.statics.getActiveBackups = function() {
  return this.find({ status: { $in: ['pending', 'running'] } })
    .sort({ createdAt: -1 })
    .populate('execution.triggeredBy', 'name email');
};

backupSchema.statics.getBackupHistory = function(limit = 50) {
  return this.find({ status: { $in: ['completed', 'failed'] } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('execution.triggeredBy', 'name email');
};

backupSchema.statics.getScheduledBackups = function() {
  return this.find({ 
    'schedule.frequency': { $ne: 'once' },
    status: { $in: ['pending', 'completed'] }
  })
  .sort({ 'schedule.nextRun': 1 });
};

backupSchema.statics.getBackupsByRetention = function() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 30); // Default 30 days
  
  return this.find({
    createdAt: { $lt: cutoffDate },
    'retention.autoDelete': true,
    status: 'completed'
  });
};

// Helper function to calculate next run time
function calculateNextRun(frequency) {
  const now = new Date();
  const nextRun = new Date(now);
  
  switch (frequency) {
    case 'daily':
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(2, 0, 0, 0); // Run at 2 AM
      break;
    case 'weekly':
      nextRun.setDate(nextRun.getDate() + 7);
      nextRun.setHours(2, 0, 0, 0); // Run at 2 AM
      break;
    case 'monthly':
      nextRun.setMonth(nextRun.getMonth() + 1);
      nextRun.setDate(1); // First day of next month
      nextRun.setHours(2, 0, 0, 0); // Run at 2 AM
      break;
    default:
      return null;
  }
  
  return nextRun;
}

const Backup = mongoose.model('Backup', backupSchema);

export default Backup;
