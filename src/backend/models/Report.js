/**
 * Report model for managing generated reports
 */
import mongoose from 'mongoose';

const reportParameterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  type: {
    type: String,
    enum: ['string', 'number', 'date', 'boolean', 'array'],
    required: true,
  }
}, { _id: false });

const reportDataSchema = new mongoose.Schema({
  summary: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  details: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  charts: {
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  }
}, { _id: false });

const reportSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    required: true,
    enum: [
      'revenue',
      'orders',
      'vendors',
      'riders',
      'payments',
      'invoices',
      'customers',
      'performance',
      'financial',
      'tax',
      'custom'
    ],
    index: true,
  },
  subType: {
    type: String,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  
  // Report generation parameters
  parameters: [reportParameterSchema],
  
  // Date range for the report
  dateRange: {
    from: {
      type: Date,
      required: true,
    },
    to: {
      type: Date,
      required: true,
    }
  },
  
  // Report data
  data: reportDataSchema,
  
  // File information
  file: {
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    mimeType: String,
    format: {
      type: String,
      enum: ['json', 'csv', 'excel', 'pdf'],
      required: true,
    }
  },
  
  // Report status
  status: {
    type: String,
    enum: ['generating', 'completed', 'failed', 'archived'],
    default: 'generating',
    index: true,
  },
  
  // Generation information
  generatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  generatedAt: {
    type: Date,
    default: Date.now,
  },
  
  // Scheduled reports
  isScheduled: {
    type: Boolean,
    default: false,
  },
  scheduleConfig: {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'quarterly'],
    },
    dayOfWeek: Number, // 0-6 for weekly
    dayOfMonth: Number, // 1-31 for monthly
    time: String, // HH:MM format
    timezone: {
      type: String,
      default: 'UTC',
    },
    nextRun: Date,
    isActive: {
      type: Boolean,
      default: true,
    }
  },
  
  // Report access and sharing
  isPublic: {
    type: Boolean,
    default: false,
  },
  sharedWith: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  
  // Report metadata
  recordCount: {
    type: Number,
    default: 0,
  },
  totalAmount: {
    type: Number,
    default: 0,
  },
  
  // Processing information
  processingTime: {
    type: Number, // in milliseconds
  },
  error: {
    message: String,
    stack: String,
  },
  
  // Multi-tenant organization support
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null,
  },
  
  // Version control for report templates
  templateVersion: {
    type: String,
    default: '1.0'
  },
  
  // Tags for categorization
  tags: [{
    type: String,
    trim: true,
  }],
  
}, {
  timestamps: true,
});

// Indexes for efficient queries
reportSchema.index({ type: 1, 'dateRange.from': -1 });
reportSchema.index({ generatedBy: 1, generatedAt: -1 });
reportSchema.index({ isScheduled: 1, 'scheduleConfig.nextRun': 1 });
reportSchema.index({ organizationId: 1 });

// Pre-save middleware to calculate processing time
reportSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status === 'completed' && !this.processingTime) {
    this.processingTime = Date.now() - this.generatedAt.getTime();
  }
  next();
});

// Static methods
reportSchema.statics.findByType = function(type, options = {}) {
  const query = { type };
  if (options.organizationId) query.organizationId = options.organizationId;
  if (options.generatedBy) query.generatedBy = options.generatedBy;
  
  return this.find(query)
    .populate('generatedBy', 'name email')
    .sort({ generatedAt: -1 });
};

reportSchema.statics.findScheduledReports = function() {
  return this.find({
    isScheduled: true,
    'scheduleConfig.isActive': true,
    'scheduleConfig.nextRun': { $lte: new Date() }
  }).populate('generatedBy');
};

reportSchema.statics.findUserReports = function(userId, options = {}) {
  const query = {
    $or: [
      { generatedBy: userId },
      { isPublic: true },
      { sharedWith: userId }
    ]
  };
  
  if (options.type) query.type = options.type;
  if (options.status) query.status = options.status;
  
  return this.find(query)
    .populate('generatedBy', 'name email')
    .sort({ generatedAt: -1 });
};

// Instance methods
reportSchema.methods.markAsCompleted = function(fileInfo) {
  this.status = 'completed';
  this.file = fileInfo;
  return this.save();
};

reportSchema.methods.markAsFailed = function(error) {
  this.status = 'failed';
  this.error = {
    message: error.message,
    stack: error.stack
  };
  return this.save();
};

reportSchema.methods.scheduleNextRun = function() {
  if (!this.isScheduled || !this.scheduleConfig.isActive) return;
  
  const now = new Date();
  const config = this.scheduleConfig;
  let nextRun = new Date();
  
  switch (config.frequency) {
    case 'daily':
      nextRun.setDate(now.getDate() + 1);
      break;
    case 'weekly':
      nextRun.setDate(now.getDate() + (7 - now.getDay() + config.dayOfWeek) % 7 || 7);
      break;
    case 'monthly':
      nextRun.setMonth(now.getMonth() + 1);
      nextRun.setDate(Math.min(config.dayOfMonth, new Date(nextRun.getFullYear(), nextRun.getMonth() + 1, 0).getDate()));
      break;
    case 'quarterly':
      nextRun.setMonth(now.getMonth() + 3);
      break;
  }
  
  // Set the time
  const [hours, minutes] = config.time.split(':').map(Number);
  nextRun.setHours(hours, minutes, 0, 0);
  
  this.scheduleConfig.nextRun = nextRun;
  return this.save();
};

const Report = mongoose.model('Report', reportSchema);

export default Report;
