import mongoose from 'mongoose';

const userNotificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'userType',
    required: true,
    index: true,
  },
  userType: {
    type: String,
    enum: ['User', 'Vendor', 'DeliveryBoy'],
    required: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  body: {
    type: String,
    required: true,
    trim: true,
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  type: {
    type: String,
    enum: ['order', 'payment', 'delivery', 'system', 'general'],
    default: 'general',
    index: true,
  },
  read: {
    type: Boolean,
    default: false,
    index: true,
  },
  readAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  // Additional fields for enhanced functionality
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  imageUrl: {
    type: String,
  },
  actionUrl: {
    type: String,
  },
  expiresAt: {
    type: Date,
  },
  deliveryStatus: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed'],
    default: 'pending',
  },
  deliveryAttempts: {
    type: Number,
    default: 0,
  },
  lastDeliveryAttempt: {
    type: Date,
  },
  // For scheduled notifications
  scheduledFor: {
    type: Date,
  },
  // For tracking user interactions
  clicked: {
    type: Boolean,
    default: false,
  },
  clickedAt: {
    type: Date,
  },
  // For grouping related notifications
  groupId: {
    type: String,
    index: true,
  },
  // Metadata for analytics
  source: {
    type: String,
    enum: ['system', 'order', 'payment', 'marketing', 'support'],
    default: 'system',
  },
  campaign: {
    type: String,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes for better performance
userNotificationSchema.index({ userId: 1, userType: 1, createdAt: -1 });
userNotificationSchema.index({ userId: 1, userType: 1, read: 1, createdAt: -1 });
userNotificationSchema.index({ type: 1, createdAt: -1 });
userNotificationSchema.index({ deliveryStatus: 1, createdAt: -1 });
userNotificationSchema.index({ scheduledFor: 1, deliveryStatus: 1 });

// Virtual for checking if notification is expired
userNotificationSchema.virtual('isExpired').get(function() {
  return this.expiresAt && this.expiresAt < new Date();
});

// Virtual for time ago
userNotificationSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
});

// Pre-save middleware
userNotificationSchema.pre('save', function(next) {
  // Auto-set readAt when notification is marked as read
  if (this.isModified('read') && this.read && !this.readAt) {
    this.readAt = new Date();
  }
  
  // Auto-set clickedAt when notification is clicked
  if (this.isModified('clicked') && this.clicked && !this.clickedAt) {
    this.clickedAt = new Date();
  }
  
  next();
});

// Static methods
userNotificationSchema.statics.getUnreadCount = async function(userId, userType) {
  return await this.countDocuments({ userId, userType, read: false });
};

userNotificationSchema.statics.getByType = async function(userId, userType, type, limit = 20) {
  return await this.find({ userId, userType, type })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

userNotificationSchema.statics.getPendingDelivery = async function(limit = 100) {
  return await this.find({ 
    deliveryStatus: 'pending',
    scheduledFor: { $lte: new Date() },
    deliveryAttempts: { $lt: 3 }
  })
  .sort({ createdAt: 1 })
  .limit(limit)
  .lean();
};

userNotificationSchema.statics.markAsDelivered = async function(notificationId) {
  return await this.findByIdAndUpdate(
    notificationId,
    { 
      deliveryStatus: 'delivered',
      lastDeliveryAttempt: new Date()
    },
    { new: true }
  );
};

userNotificationSchema.statics.markDeliveryFailed = async function(notificationId) {
  return await this.findByIdAndUpdate(
    notificationId,
    { 
      $inc: { deliveryAttempts: 1 },
      deliveryStatus: 'failed',
      lastDeliveryAttempt: new Date()
    },
    { new: true }
  );
};

userNotificationSchema.statics.cleanupExpired = async function() {
  const result = await this.deleteMany({
    expiresAt: { $lt: new Date() },
    read: true
  });
  return result.deletedCount;
};

userNotificationSchema.statics.cleanupOldRead = async function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  const result = await this.deleteMany({
    read: true,
    createdAt: { $lt: cutoffDate }
  });
  return result.deletedCount;
};

// Instance methods
userNotificationSchema.methods.markAsRead = async function() {
  this.read = true;
  this.readAt = new Date();
  return await this.save();
};

userNotificationSchema.methods.markAsClicked = async function() {
  this.clicked = true;
  this.clickedAt = new Date();
  return await this.save();
};

userNotificationSchema.methods.canRetryDelivery = function() {
  return this.deliveryStatus === 'failed' && this.deliveryAttempts < 3;
};

userNotificationSchema.methods.isScheduled = function() {
  return this.scheduledFor && this.scheduledFor > new Date();
};

// Transform method for API responses
userNotificationSchema.methods.toAPIResponse = function() {
  return {
    id: this._id,
    title: this.title,
    body: this.body,
    data: this.data,
    type: this.type,
    read: this.read,
    readAt: this.readAt,
    createdAt: this.createdAt,
    timeAgo: this.timeAgo,
    priority: this.priority,
    imageUrl: this.imageUrl,
    actionUrl: this.actionUrl,
    clicked: this.clicked,
    clickedAt: this.clickedAt,
  };
};

const UserNotification = mongoose.model('UserNotification', userNotificationSchema);

export default UserNotification;
