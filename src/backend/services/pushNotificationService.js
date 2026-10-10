import User from '../models/User.js';
import Order from '../models/Order.js';

class PushNotificationService {
  constructor() {
    this.isInitialized = false;
    this.app = null;
    this.admin = null;
  }

  // Initialize Firebase Admin SDK
  async initialize() {
    try {
      // Check if already initialized
      if (this.isInitialized) {
        return;
      }

      // Lazy-load firebase-admin (allows server to start when package is missing)
      try {
        const { default: admin } = await import('firebase-admin');
        this.admin = admin;
      } catch (err) {
        console.warn('⚠️  firebase-admin not installed. Push notifications disabled. Run: npm install firebase-admin');
        return;
      }

      /**
       * The credentials, from three plain variables rather than one line of
       * JSON.
       *
       * A whole service account squeezed onto a single line of a .env file
       * carries a PEM key whose newlines are escaped, and something between
       * the file and JSON.parse was leaving them as the two characters
       * backslash-n: the JSON read back fine and the key inside it was
       * rubbish, which surfaces as "Only 8, 16, 24, or 32 bits supported".
       * Three separate values have no such ambiguity, and the rest of the
       * server already reads them that way.
       */
      let serviceAccount = null;

      const blob = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
      if (blob) {
        try {
          serviceAccount = JSON.parse(blob);
        } catch {
          serviceAccount = null;
        }
      }

      if (!serviceAccount?.private_key && process.env.FIREBASE_PRIVATE_KEY) {
        serviceAccount = {
          project_id: process.env.FIREBASE_PROJECT_ID,
          client_email: process.env.FIREBASE_CLIENT_EMAIL,
          private_key: process.env.FIREBASE_PRIVATE_KEY,
        };
      }

      if (!serviceAccount?.private_key) {
        console.warn('⚠️  Firebase service account key not provided. Push notifications disabled.');
        return;
      }

      // Escaped newlines are how a PEM key survives an env file; the SDK
      // needs them back as real line breaks before it will read the key.
      serviceAccount = {
        ...serviceAccount,
        private_key: String(serviceAccount.private_key).replace(/\\n/g, '\n'),
      };

      /**
       * Two services in this codebase set Firebase up, and the SDK allows one
       * default app per process - the second call throws rather than being
       * ignored. Whoever gets there first wins and the other joins it.
       */
      this.app = this.admin.apps.length
        ? this.admin.app()
        : this.admin.initializeApp({
            credential: this.admin.credential.cert(serviceAccount),
            projectId: serviceAccount.project_id,
          });

      this.isInitialized = true;
      console.log('✅ Firebase Admin SDK initialized for push notifications');
    } catch (error) {
      console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    }
  }

  // Store FCM token for user
  async storeDeviceToken(userId, token, deviceInfo = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Initialize tokens array if not exists
      if (!user.fcmTokens) {
        user.fcmTokens = [];
      }

      // Remove existing token for this device (if any)
      user.fcmTokens = user.fcmTokens.filter(t => t.token !== token);

      // Add new token
      user.fcmTokens.push({
        token,
        deviceInfo: {
          platform: deviceInfo.platform || 'unknown',
          version: deviceInfo.version || 'unknown',
          deviceId: deviceInfo.deviceId || 'unknown',
          ...deviceInfo
        },
        createdAt: new Date(),
        lastUsed: new Date()
      });

      // Keep only last 5 tokens per user (cleanup old tokens)
      user.fcmTokens = user.fcmTokens
        .sort((a, b) => b.lastUsed - a.lastUsed)
        .slice(0, 5);

      await user.save();

      console.log(`📱 FCM token stored for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Failed to store FCM token:', error);
      throw error;
    }
  }

  // Remove FCM token for user
  async removeDeviceToken(userId, token) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (user.fcmTokens) {
        user.fcmTokens = user.fcmTokens.filter(t => t.token !== token);
        await user.save();
      }

      console.log(`📱 FCM token removed for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Failed to remove FCM token:', error);
      throw error;
    }
  }

  // Send push notification to specific user
  async sendToUser(userId, notification, data = {}) {
    try {
      if (!this.isInitialized) {
        console.warn('Push notifications not initialized');
        return false;
      }

      const user = await User.findById(userId);
      if (!user || !user.fcmTokens || user.fcmTokens.length === 0) {
        console.log(`No FCM tokens found for user ${userId}`);
        return false;
      }

      // Get active tokens
      const tokens = user.fcmTokens.map(t => t.token);

      // Prepare message
      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl || null,
          sound: notification.sound || 'default'
        },
        data: {
          type: data.type || 'general',
          orderId: data.orderId || '',
          userId: userId.toString(),
          ...data
        },
        tokens: tokens,
        android: {
          priority: 'high',
          notification: {
            sound: 'default'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: data.badge || 1
            }
          }
        }
      };

      // Send notification
      const response = await this.admin.messaging().sendMulticast(message);
      
      // Handle failed tokens
      if (response.failureCount > 0) {
        await this.cleanupFailedTokens(user, response.responses);
      }

      console.log(`📱 Push notification sent to user ${userId}: ${response.successCount} success, ${response.failureCount} failed`);
      return response.successCount > 0;
    } catch (error) {
      console.error('Failed to send push notification:', error);
      return false;
    }
  }

  // Send push notification to multiple users
  async sendToMultipleUsers(userIds, notification, data = {}) {
    try {
      if (!this.isInitialized) {
        console.warn('Push notifications not initialized');
        return false;
      }

      const results = await Promise.allSettled(
        userIds.map(userId => this.sendToUser(userId, notification, data))
      );

      const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
      console.log(`📱 Bulk push notification sent: ${successCount}/${userIds.length} successful`);

      return successCount > 0;
    } catch (error) {
      console.error('Failed to send bulk push notification:', error);
      return false;
    }
  }

  // Send order status notification
  async sendOrderStatusUpdate(orderId, status, additionalData = {}) {
    try {
      const order = await Order.findById(orderId)
        .populate('userId', 'name email fcmTokens')
        .populate('restaurantId', 'name');

      if (!order) {
        throw new Error('Order not found');
      }

      const notification = this.getOrderStatusNotification(order, status);
      const data = {
        type: 'order_status',
        orderId: orderId.toString(),
        status,
        restaurantId: order.restaurantId._id.toString(),
        restaurantName: order.restaurantId.name,
        ...additionalData
      };

      return await this.sendToUser(order.userId._id, notification, data);
    } catch (error) {
      console.error('Failed to send order status notification:', error);
      return false;
    }
  }

  // Send rider assignment notification
  async sendRiderAssignment(orderId, riderId) {
    try {
      const order = await Order.findById(orderId)
        .populate('userId', 'name email fcmTokens')
        .populate('riderId', 'name phone');

      if (!order) {
        throw new Error('Order not found');
      }

      const notification = {
        title: 'Rider Assigned! 🏍️',
        body: `${order.riderId.name} is on the way to pick up your order`,
        sound: 'default'
      };

      const data = {
        type: 'rider_assigned',
        orderId: orderId.toString(),
        riderId: riderId.toString(),
        riderName: order.riderId.name,
        riderPhone: order.riderId.phone
      };

      return await this.sendToUser(order.userId._id, notification, data);
    } catch (error) {
      console.error('Failed to send rider assignment notification:', error);
      return false;
    }
  }

  // Send promotional notification (admin only)
  async sendPromotionalNotification(targetUsers, notification, data = {}) {
    try {
      const notificationData = {
        title: notification.title,
        body: notification.body,
        imageUrl: notification.imageUrl || null,
        sound: 'default'
      };

      const payload = {
        type: 'promotional',
        ...data
      };

      return await this.sendToMultipleUsers(targetUsers, notificationData, payload);
    } catch (error) {
      console.error('Failed to send promotional notification:', error);
      return false;
    }
  }

  // Get notification content for order status
  getOrderStatusNotification(order, status) {
    const notifications = {
      'Waiting for Confirmation': {
        title: 'Order Placed! 🛒',
        body: `Your order from ${order.restaurantId.name} has been received`
      },
      'Order Confirmed': {
        title: 'Order Confirmed! ✅',
        body: `${order.restaurantId.name} has confirmed your order`
      },
      'Processing': {
        title: 'Preparing Your Food 🍳',
        body: `${order.restaurantId.name} is preparing your delicious meal`
      },
      'Ready': {
        title: 'Order Ready! 🎉',
        body: `Your order is ready for pickup`
      },
      'OnWay': {
        title: 'On the Way! 🚚',
        body: `Your order is on the way to your location`
      },
      'Delivered': {
        title: 'Delivered! 🎊',
        body: 'Enjoy your meal! Thank you for ordering'
      },
      'Cancelled': {
        title: 'Order Cancelled ❌',
        body: 'Your order has been cancelled'
      }
    };

    return notifications[status] || {
      title: 'Order Update',
      body: `Your order status is now: ${status}`
    };
  }

  // Clean up failed tokens
  async cleanupFailedTokens(user, responses) {
    try {
      const failedTokens = [];
      
      responses.forEach((response, index) => {
        if (!response.success && user.fcmTokens[index]) {
          failedTokens.push(user.fcmTokens[index].token);
        }
      });

      if (failedTokens.length > 0) {
        user.fcmTokens = user.fcmTokens.filter(t => !failedTokens.includes(t.token));
        await user.save();
        console.log(`🧹 Cleaned up ${failedTokens.length} failed FCM tokens`);
      }
    } catch (error) {
      console.error('Failed to cleanup tokens:', error);
    }
  }

  // Get notification statistics
  async getNotificationStats() {
    try {
      const totalUsers = await User.countDocuments();
      const usersWithTokens = await User.countDocuments({ 
        'fcmTokens.0': { $exists: true } 
      });
      const totalTokens = await User.aggregate([
        { $project: { tokenCount: { $size: { $ifNull: ['$fcmTokens', []] } } } },
        { $group: { _id: null, total: { $sum: '$tokenCount' } } }
      ]);

      return {
        isInitialized: this.isInitialized,
        totalUsers,
        usersWithTokens,
        totalTokens: totalTokens[0]?.total || 0,
        coverage: totalUsers > 0 ? (usersWithTokens / totalUsers * 100).toFixed(2) + '%' : '0%'
      };
    } catch (error) {
      console.error('Failed to get notification stats:', error);
      return {
        isInitialized: this.isInitialized,
        error: error.message
      };
    }
  }

  // Test notification
  async sendTestNotification(userId) {
    try {
      const notification = {
        title: 'Test Notification 🧪',
        body: 'This is a test notification from Vinsta',
        sound: 'default'
      };

      const data = {
        type: 'test',
        timestamp: new Date().toISOString()
      };

      return await this.sendToUser(userId, notification, data);
    } catch (error) {
      console.error('Failed to send test notification:', error);
      return false;
    }
  }
}

// Singleton instance
const pushNotificationService = new PushNotificationService();

export default pushNotificationService;
