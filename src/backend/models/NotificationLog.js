/**
 * Notification Log Model
 * Tracks all push notifications sent through the system
 * Provides analytics and delivery tracking
 */

import mongoose from 'mongoose';

const notificationLogSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['single', 'multiple', 'broadcast'],
    required: true,
  },
  recipients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  }],
  notification: {
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    imageUrl: {
      type: String,
    },
    sound: {
      type: String,
      default: 'default',
    },
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  priority: {
    type: String,
    enum: ['high', 'normal', 'low'],
    default: 'normal',
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'success', 'failed', 'retry', 'cancelled'],
    default: 'pending',
  },
  attempts: {
    type: Number,
    default: 0,
  },
  retryCount: {
    type: Number,
    default: 0,
  },
  maxRetries: {
    type: Number,
    default: 3,
  },
  deliveryStats: {
    totalRecipients: {
      type: Number,
      default: 0,
    },
    successfulDeliveries: {
      type: Number,
      default: 0,
    },
    failedDeliveries: {
      type: Number,
      default: 0,
    },
    deliveryRate: {
      type: Number,
      default: 0,
    },
  },
  error: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  processedAt: {
    type: Date,
  },
  completedAt: {
    type: Date,
  },
  processingTime: {
    type: Number, // in milliseconds
  },
  // Analytics fields
  category: {
    type: String,
    enum: ['order', 'payment', 'rider', 'promotional', 'system', 'test'],
    default: 'system',
  },
  campaignId: {
    type: String,
  },
  source: {
    type: String,
    enum: ['user', 'admin', 'system', 'api'],
    default: 'system',
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
}, {
  timestamps: true,
});

// Indexes for performance
notificationLogSchema.index({ createdAt: -1 });
notificationLogSchema.index({ status: 1 });
notificationLogSchema.index({ category: 1 });
notificationLogSchema.index({ type: 1 });
notificationLogSchema.index({ priority: 1 });
notificationLogSchema.index({ 'recipients': 1 });

// Pre-save middleware
notificationLogSchema.pre('save', function(next) {
  // Calculate delivery rate
  if (this.deliveryStats.totalRecipients > 0) {
    this.deliveryStats.deliveryRate = 
      (this.deliveryStats.successfulDeliveries / this.deliveryStats.totalRecipients) * 100;
  }

  // Calculate processing time
  if (this.processedAt && this.createdAt) {
    this.processingTime = this.processedAt.getTime() - this.createdAt.getTime();
  }

  // Set completed time
  if (this.status === 'success' || this.status === 'failed' || this.status === 'cancelled') {
    this.completedAt = new Date();
  }

  next();
});

// Static methods
notificationLogSchema.statics.getNotificationStats = function(startDate, endDate) {
  const matchStage = {};
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalNotifications: { $sum: 1 },
        successfulNotifications: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        failedNotifications: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        totalRecipients: { $sum: '$deliveryStats.totalRecipients' },
        successfulDeliveries: { $sum: '$deliveryStats.successfulDeliveries' },
        averageProcessingTime: { $avg: '$processingTime' },
        totalAttempts: { $sum: '$attempts' },
      }
    },
    {
      $project: {
        totalNotifications: 1,
        successfulNotifications: 1,
        failedNotifications: 1,
        successRate: {
          $multiply: [
            { $divide: ['$successfulNotifications', '$totalNotifications'] },
            100
          ]
        },
        totalRecipients: 1,
        successfulDeliveries: 1,
        deliveryRate: {
          $multiply: [
            { $divide: ['$successfulDeliveries', '$totalRecipients'] },
            100
          ]
        },
        averageProcessingTime: { $round: ['$averageProcessingTime', 2] },
        averageAttempts: { $divide: ['$totalAttempts', '$totalNotifications'] },
      }
    }
  ]);
};

notificationLogSchema.statics.getCategoryStats = function(startDate, endDate) {
  const matchStage = {};
  if (startDate || endDate) {
    matchStage.createdAt = {};
    if (startDate) matchStage.createdAt.$gte = new Date(startDate);
    if (endDate) matchStage.createdAt.$lte = new Date(endDate);
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        successful: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
        totalRecipients: { $sum: '$deliveryStats.totalRecipients' },
        successfulDeliveries: { $sum: '$deliveryStats.successfulDeliveries' },
      }
    },
    {
      $project: {
        category: '$_id',
        count: 1,
        successful: 1,
        failed: 1,
        successRate: {
          $multiply: [
            { $divide: ['$successful', '$count'] },
            100
          ]
        },
        totalRecipients: 1,
        successfulDeliveries: 1,
        deliveryRate: {
          $multiply: [
            { $divide: ['$successfulDeliveries', '$totalRecipients'] },
            100
          ]
        },
      }
    },
    { $sort: { count: -1 } }
  ]);
};

notificationLogSchema.statics.getHourlyStats = function(date) {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  return this.aggregate([
    {
      $match: {
        createdAt: {
          $gte: targetDate,
          $lt: nextDay
        }
      }
    },
    {
      $group: {
        _id: {
          hour: { $hour: '$createdAt' }
        },
        count: { $sum: 1 },
        successful: {
          $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] }
        },
        failed: {
          $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
        },
      }
    },
    {
      $project: {
        hour: '$_id.hour',
        count: 1,
        successful: 1,
        failed: 1,
        successRate: {
          $multiply: [
            { $divide: ['$successful', '$count'] },
            100
          ]
        },
      }
    },
    { $sort: { hour: 1 } }
  ]);
};

notificationLogSchema.statics.getFailedNotifications = function(limit = 50) {
  return this.find({ status: 'failed' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('recipients', 'name email')
    .select('jobId type notification status attempts error createdAt completedAt');
};

notificationLogSchema.statics.getRecentNotifications = function(limit = 20) {
  return this.find()
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('recipients', 'name email')
    .select('jobId type notification status deliveryStats createdAt');
};

// Instance methods
notificationLogSchema.methods.markAsProcessed = function() {
  this.status = 'processing';
  this.processedAt = new Date();
  return this.save();
};

notificationLogSchema.methods.markAsSuccess = function(deliveryStats) {
  this.status = 'success';
  this.deliveryStats = {
    ...this.deliveryStats,
    ...deliveryStats
  };
  this.completedAt = new Date();
  return this.save();
};

notificationLogSchema.methods.markAsFailed = function(error) {
  this.status = 'failed';
  this.error = error;
  this.completedAt = new Date();
  return this.save();
};

notificationLogSchema.methods.markAsRetry = function() {
  this.status = 'retry';
  this.retryCount += 1;
  return this.save();
};

notificationLogSchema.methods.updateDeliveryStats = function(successful, failed) {
  this.deliveryStats.successfulDeliveries += successful;
  this.deliveryStats.failedDeliveries += failed;
  return this.save();
};

const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

export default NotificationLog;
