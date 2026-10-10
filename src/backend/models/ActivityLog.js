import mongoose from 'mongoose';

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Activity log must be associated with a user'],
  },
  actionType: {
    type: String,
    enum: [
      'login',
      'logout',
      'order_created',
      'order_cancelled',
      'order_completed',
      'payment_successful',
      'payment_failed',
      'profile_updated',
      'address_added',
      'address_updated',
      'address_deleted',
      'password_changed',
      'email_verified',
      'phone_verified',
      'wallet_recharged',
      'wallet_deducted',
      'review_submitted',
      'review_updated',
      'support_ticket_created',
      'support_ticket_resolved',
      'referral_sent',
      'referral_accepted',
      'coupon_used',
      'restaurant_favorited',
      'restaurant_unfavorited',
      'admin_login',
      'admin_logout',
      'admin_user_created',
      'admin_user_updated',
      'admin_user_blocked',
      'admin_user_unblocked',
      'admin_order_assigned',
      'admin_refund_approved',
      'admin_refund_rejected',
      'admin_campaign_created',
      'admin_settings_updated',
      // Any other admin write, so a change is never dropped for want of a name.
      'admin_action',
      'rider_online',
      'rider_offline',
      'rider_order_accepted',
      'rider_order_completed',
      'vendor_login',
      'vendor_logout',
      'vendor_menu_updated',
      'vendor_restaurant_updated',
      'vendor_order_accepted',
      'vendor_order_ready'
    ],
    required: [true, 'Action type is required'],
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
  },
  ipAddress: {
    type: String,
    trim: true,
  },
  userAgent: {
    type: String,
    trim: true,
  },
  deviceInfo: {
    type: {
      type: String,
      enum: ['mobile', 'tablet', 'desktop', 'api', 'unknown'],
      default: 'unknown',
    },
    os: String,
    browser: String,
    appVersion: String,
  },
  location: {
    city: String,
    region: String,
    country: String,
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
  },
  metadata: {
    // Store additional context based on action type
    orderId: mongoose.Schema.Types.ObjectId,
    restaurantId: mongoose.Schema.Types.ObjectId,
    paymentMethod: String,
    amount: Number,
    previousValues: mongoose.Schema.Types.Mixed,
    newValues: mongoose.Schema.Types.Mixed,
    sessionId: String,
    errorCode: String,
    errorMessage: String,
    duration: Number, // For actions like login, order completion time
    referrer: String,
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low',
  },
  status: {
    type: String,
    enum: ['success', 'failure', 'warning'],
    default: 'success',
  },
  sessionId: {
    type: String,
    trim: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes for efficient queries
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ actionType: 1, timestamp: -1 });
activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ status: 1, timestamp: -1 });
activityLogSchema.index({ severity: 1, timestamp: -1 });
activityLogSchema.index({ 'deviceInfo.type': 1, timestamp: -1 });

// Compound index for admin dashboard queries
activityLogSchema.index({ 
  actionType: 1, 
  status: 1, 
  timestamp: -1 
});

// TTL index to automatically remove old logs (optional - keep 1 year)
activityLogSchema.index({ timestamp: 1 }, { 
  expireAfterSeconds: 365 * 24 * 60 * 60 
});

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;
