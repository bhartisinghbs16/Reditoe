// @ts-ignore - Firebase Admin SDK will be installed when space is available
import admin from 'firebase-admin';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import DeliveryBoy from '../models/DeliveryBoy.js';
import UserNotification from '../models/UserNotification.js';
import Order from '../models/Order.js';

class NotificationService {
  constructor() {
    this.initializeFirebase();
  }

  initializeFirebase() {
    try {
      // Check if Firebase credentials are available
      if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_PRIVATE_KEY) {
        console.log('⚠️ Firebase credentials not configured. Push notifications will be disabled.');
        this.firebaseInitialized = false;
        return;
      }

      const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      };

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      this.firebaseInitialized = true;
      console.log('✅ Firebase Admin SDK initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Firebase Admin SDK:', error);
      this.firebaseInitialized = false;
    }
  }

  async registerDeviceToken(userId, token, userType = 'user') {
    try {
      let Model;
      switch (userType) {
        case 'vendor':
          Model = Restaurant;
          break;
        case 'rider':
        case 'DeliveryBoy':
          Model = DeliveryBoy;
          break;
        default:
          Model = User;
      }

      // Update user's device tokens
      const updateData = {
        $addToSet: { deviceTokens: token },
        lastActiveAt: new Date(),
      };

      await Model.findByIdAndUpdate(userId, updateData, { new: true });
      
      console.log(`Device token registered for ${userType}:`, userId);
      return { success: true };
    } catch (error) {
      console.error('Error registering device token:', error);
      throw error;
    }
  }

  async unregisterDeviceToken(userId, token, userType = 'user') {
    try {
      let Model;
      switch (userType) {
        case 'vendor':
          Model = Restaurant;
          break;
        case 'rider':
        case 'DeliveryBoy':
          Model = DeliveryBoy;
          break;
        default:
          Model = User;
      }

      await Model.findByIdAndUpdate(userId, {
        $pull: { deviceTokens: token },
      });

      console.log(`Device token unregistered for ${userType}:`, userId);
      return { success: true };
    } catch (error) {
      console.error('Error unregistering device token:', error);
      throw error;
    }
  }

  async sendNotificationToUser(userId, notification, userType = 'user') {
    try {
      let Model;
      switch (userType) {
        case 'vendor':
          Model = Restaurant;
          break;
        case 'rider':
        case 'DeliveryBoy':
          Model = DeliveryBoy;
          break;
        default:
          Model = User;
      }

      /*
       * Whose device, and which field.
       *
       * Riders are Users with role 'rider' on this deployment, but dispatch
       * asks for them as 'DeliveryBoy' — so every order request looked the
       * rider up in a collection they are not in, found nothing, and was
       * "stored without push". And the apps register into `fcmTokens`, which
       * is the field the User model declares and the token endpoint writes;
       * only `deviceTokens` was read, so even the right record had no tokens.
       * Both are read now, and a rider is looked for in either collection.
       */
      let holder = await Model.findById(userId).select('deviceTokens fcmTokens');
      if (!holder && (userType === 'rider' || userType === 'DeliveryBoy')) {
        holder = await User.findById(userId).select('deviceTokens fcmTokens');
        if (holder) Model = User;
      }

      const tokens = [
        ...(holder?.deviceTokens ?? []),
        ...(holder?.fcmTokens ?? []).map((entry) =>
          typeof entry === 'string' ? entry : entry?.token
        ),
      ].filter(Boolean);

      if (tokens.length === 0) {
        console.log(`No device tokens for ${userType}:`, userId, '— storing only');
        await this.storeNotification(userId, notification, userType);
        return { success: true, message: 'Stored without push' };
      }

      const user = { deviceTokens: tokens };

      // Send to all device tokens
      const results = await Promise.allSettled(
        tokens.map(token => 
          this.sendPushNotification(token, notification)
        )
      );

      // Handle failed tokens
      const failedTokens = [];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const error = result.reason;
          if (error.code === 'messaging/registration-token-not-registered' ||
              error.code === 'messaging/invalid-registration-token') {
            failedTokens.push(user.deviceTokens[index]);
          }
        }
      });

      // Remove failed tokens
      if (failedTokens.length > 0) {
        await Model.findByIdAndUpdate(userId, {
          $pull: {
            deviceTokens: { $in: failedTokens },
            fcmTokens: { token: { $in: failedTokens } },
          },
        });
        console.log(`Removed ${failedTokens.length} invalid tokens for ${userType}:`, userId);
      }

      // Store notification in database
      await this.storeNotification(userId, notification, userType);

      return { 
        success: true, 
        sentCount: results.filter(r => r.status === 'fulfilled').length,
        failedCount: failedTokens.length 
      };
    } catch (error) {
      console.error('Error sending notification to user:', error);
      throw error;
    }
  }

  async sendNotificationToMultipleUsers(userIds, notification, userType = 'user') {
    try {
      let Model;
      switch (userType) {
        case 'vendor':
          Model = Restaurant;
          break;
        case 'rider':
        case 'DeliveryBoy':
          Model = DeliveryBoy;
          break;
        default:
          Model = User;
      }

      const users = await Model.find({ 
        _id: { $in: userIds } 
      }).select('deviceTokens');

      const allTokens = [];
      users.forEach(user => {
        if (user.deviceTokens && user.deviceTokens.length > 0) {
          allTokens.push(...user.deviceTokens);
        }
      });

      if (allTokens.length === 0) {
        console.log(`No device tokens found for ${userType}s`);
        return { success: false, message: 'No device tokens found' };
      }

      // Send notification to all tokens
      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: notification.data || {},
        tokens: allTokens,
      };

      const response = await this.messaging.sendMulticast(message);
      
      console.log(`Multicast notification sent: ${response.successCount} success, ${response.failureCount} failures`);

      // Store notifications for each user
      await Promise.all(
        userIds.map(userId => 
          this.storeNotification(userId, notification, userType)
        )
      );

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      console.error('Error sending notification to multiple users:', error);
      throw error;
    }
  }

  async sendPushNotification(token, notification) {
    try {
      // Check if Firebase is initialized
      if (!this.firebaseInitialized) {
        console.log('⚠️ Firebase not initialized, skipping push notification');
        return { success: false, message: 'Firebase not configured' };
      }

      const message = {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
          imageUrl: notification.imageUrl,
        },
        data: notification.data || {},
        android: {
          priority: 'high',
          notification: {
            channelId: this.getChannelId(notification.type),
            priority: 'high',
            defaultSound: true,
            defaultVibrateTimings: true,
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              category: this.getAPNSCategory(notification.type),
            },
          },
        },
      };

      const response = await this.messaging.send(message);
      return response;
    } catch (error) {
      console.error('Error sending push notification:', error);
      throw error;
    }
  }

  async sendOrderNotification(orderId, notificationType, additionalData = {}) {
    try {
      const order = await this.getOrderDetails(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      const notifications = [];

      // Customer notification
      if (notificationType !== 'order_placed') {
        notifications.push({
          userId: order.userId,
          userType: 'user',
          notification: this.createOrderNotification(order, notificationType, 'customer', additionalData),
        });
      }

      // Restaurant notification
      if (['order_placed', 'order_cancelled'].includes(notificationType)) {
        notifications.push({
          userId: order.vendorId,
          userType: 'vendor',
          notification: this.createOrderNotification(order, notificationType, 'vendor', additionalData),
        });
      }

      // Rider notification
      if (order.assignedRider && ['order_accepted', 'order_picked', 'order_on_the_way'].includes(notificationType)) {
        notifications.push({
          userId: order.assignedRider,
          userType: 'DeliveryBoy',
          notification: this.createOrderNotification(order, notificationType, 'rider', additionalData),
        });
      }

      // Send all notifications
      const results = await Promise.allSettled(
        notifications.map(({ userId, userType, notification }) =>
          this.sendNotificationToUser(userId, notification, userType)
        )
      );

      return results.map(result => 
        result.status === 'fulfilled' ? result.value : { success: false, error: result.reason }
      );
    } catch (error) {
      console.error('Error sending order notification:', error);
      throw error;
    }
  }

  createOrderNotification(order, notificationType, recipient, additionalData) {
    const notifications = {
      order_placed: {
        customer: {
          title: 'Order Placed Successfully!',
          body: `Your order #${order.orderNumber} has been placed and is being processed.`,
          type: 'order',
          data: { orderId: order._id.toString(), orderNumber: order.orderNumber, type: 'order_placed' },
        },
        vendor: {
          title: 'New Order Received!',
          body: `New order #${order.orderNumber} received. Please accept to start preparing.`,
          type: 'order',
          data: { orderId: order._id.toString(), orderNumber: order.orderNumber, type: 'new_order' },
        },
      },
      order_accepted: {
        customer: {
          title: 'Order Accepted!',
          body: `Your order #${order.orderNumber} has been accepted by the restaurant.`,
          type: 'order',
          data: { orderId: order._id.toString(), orderNumber: order.orderNumber, type: 'order_accepted' },
        },
        rider: {
          title: 'New Order Assignment!',
          body: `You have been assigned order #${order.orderNumber}. Please pick it up from the restaurant.`,
          type: 'order',
          data: { orderId: order._id.toString(), orderNumber: order.orderNumber, type: 'new_assignment' },
        },
      },
      order_picked: {
        customer: {
          title: 'Order Picked Up!',
          body: `Your order #${order.orderNumber} has been picked up and is on the way.`,
          type: 'delivery',
          data: { orderId: order._id.toString(), orderNumber: order.orderNumber, type: 'order_picked' },
        },
      },
      order_on_the_way: {
        customer: {
          title: 'Order On The Way!',
          body: `Your order #${order.orderNumber} is on the way. Estimated arrival: ${additionalData.eta || 'Soon'}`,
          type: 'delivery',
          data: { orderId: order._id.toString(), orderNumber: order.orderNumber, type: 'on_the_way' },
        },
      },
      order_delivered: {
        customer: {
          title: 'Order Delivered!',
          body: `Your order #${order.orderNumber} has been delivered successfully. Enjoy your meal!`,
          type: 'delivery',
          data: { orderId: order._id.toString(), orderNumber: order.orderNumber, type: 'order_delivered' },
        },
      },
      order_cancelled: {
        customer: {
          title: 'Order Cancelled',
          body: `Your order #${order.orderNumber} has been cancelled. Refund will be processed if applicable.`,
          type: 'order',
          data: { orderId: order._id.toString(), orderNumber: order.orderNumber, type: 'order_cancelled' },
        },
        vendor: {
          title: 'Order Cancelled',
          body: `Order #${order.orderNumber} has been cancelled by the customer.`,
          type: 'order',
          data: { orderId: order._id.toString(), orderNumber: order.orderNumber, type: 'order_cancelled' },
        },
      },
    };

    return notifications[notificationType]?.[recipient] || {
      title: 'Order Update',
      body: `Your order #${order.orderNumber} has been updated.`,
      type: 'order',
      data: { orderId: order._id.toString(), orderNumber: order.orderNumber },
    };
  }

  async sendPaymentNotification(userId, paymentType, paymentData) {
    try {
      const notifications = {
        payment_success: {
          title: 'Payment Successful!',
          body: `Your payment of ₹${paymentData.amount} has been processed successfully.`,
          type: 'payment',
          data: { 
            type: 'payment_success',
            paymentId: paymentData.paymentId,
            amount: paymentData.amount.toString(),
            orderId: paymentData.orderId,
          },
        },
        payment_failed: {
          title: 'Payment Failed',
          body: `Your payment of ₹${paymentData.amount} could not be processed. Please try again.`,
          type: 'payment',
          data: { 
            type: 'payment_failed',
            paymentId: paymentData.paymentId,
            amount: paymentData.amount.toString(),
            orderId: paymentData.orderId,
          },
        },
        wallet_topup: {
          title: 'Wallet Top-up Successful!',
          body: `Your wallet has been credited with ₹${paymentData.amount}.`,
          type: 'payment',
          data: { 
            type: 'wallet_topup',
            amount: paymentData.amount.toString(),
            transactionId: paymentData.transactionId,
          },
        },
        withdrawal_approved: {
          title: 'Withdrawal Approved!',
          body: `Your withdrawal request of ₹${paymentData.amount} has been approved and processed.`,
          type: 'payment',
          data: { 
            type: 'withdrawal_approved',
            amount: paymentData.amount.toString(),
            withdrawalId: paymentData.withdrawalId,
          },
        },
      };

      const notification = notifications[paymentType];
      if (!notification) {
        throw new Error(`Unknown payment notification type: ${paymentType}`);
      }

      return await this.sendNotificationToUser(userId, notification);
    } catch (error) {
      console.error('Error sending payment notification:', error);
      throw error;
    }
  }

  async storeNotification(userId, notification, userType = 'user') {
    try {
      const normalizedUserType =
        userType === 'rider' || userType === 'DeliveryBoy'
          ? 'DeliveryBoy'
          : userType === 'vendor'
            ? 'Vendor'
            : 'User';

      console.log('[storeNotification] Saving notification:', {
        userId: userId?.toString(),
        userType: normalizedUserType,
        title: notification.title,
        type: notification.type || 'general',
      });

      const notificationDoc = new UserNotification({
        userId,
        userType: normalizedUserType,
        title: notification.title,
        body: notification.body,
        data: notification.data || {},
        type: notification.type || 'general',
        read: false,
      });

      const saved = await notificationDoc.save();
      console.log('[storeNotification] Saved successfully:', saved._id.toString());
      return saved;
    } catch (error) {
      console.error('[storeNotification] FAILED:', error.message);
      console.error('[storeNotification] Full error:', JSON.stringify(error, null, 2));
    }
  }

  async getUserNotifications(userId, userType = 'user', page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const normalizedUserType =
        userType === 'rider' || userType === 'DeliveryBoy'
          ? 'DeliveryBoy'
          : userType === 'vendor'
            ? 'Vendor'
            : 'User';

      const notifications = await UserNotification.find({ userId, userType: normalizedUserType })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await UserNotification.countDocuments({ userId, userType: normalizedUserType });

      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw error;
    }
  }

  async markNotificationAsRead(notificationId, userId) {
    try {
      await UserNotification.findOneAndUpdate(
        { _id: notificationId, userId },
        { read: true, readAt: new Date() },
        { new: true }
      );

      return { success: true };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  async markAllNotificationsAsRead(userId, userType = 'user') {
    try {
      const normalizedUserType =
        userType === 'rider' || userType === 'DeliveryBoy'
          ? 'DeliveryBoy'
          : userType === 'vendor'
            ? 'Vendor'
            : 'User';

      await UserNotification.updateMany(
        { userId, userType: normalizedUserType, read: false },
        { read: true, readAt: new Date() }
      );

      return { success: true };
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  async deleteNotification(notificationId, userId) {
    try {
      await UserNotification.findOneAndDelete({ _id: notificationId, userId });
      return { success: true };
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }

  async clearAllNotifications(userId, userType = 'user') {
    try {
      const normalizedUserType =
        userType === 'rider' || userType === 'DeliveryBoy'
          ? 'DeliveryBoy'
          : userType === 'vendor'
            ? 'Vendor'
            : 'User';

      await UserNotification.deleteMany({ userId, userType: normalizedUserType });
      return { success: true };
    } catch (error) {
      console.error('Error clearing all notifications:', error);
      throw error;
    }
  }

  getChannelId(type) {
    const channels = {
      order: 'order_updates',
      payment: 'payment_notifications',
      delivery: 'delivery_updates',
      default: 'general_notifications',
    };
    return channels[type] || channels.default;
  }

  getAPNSCategory(type) {
    const categories = {
      order: 'ORDER_UPDATES',
      payment: 'PAYMENT_NOTIFICATIONS',
      delivery: 'DELIVERY_UPDATES',
      default: 'GENERAL_NOTIFICATIONS',
    };
    return categories[type] || categories.default;
  }

  async getOrderDetails(orderId) {
    try {
      const order = await Order.findById(orderId).lean();
      if (!order) return null;
      return {
        ...order,
        vendorId: order.restaurantId,
        assignedRider: order.riderId
      };
    } catch (error) {
      console.error('Error getting order details:', error);
      throw error;
    }
  }
}

export default new NotificationService();
