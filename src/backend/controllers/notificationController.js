import notificationService from '../services/notificationService.js';
import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import DeliveryBoy from '../models/DeliveryBoy.js';

class NotificationController {
  // Register device token
  async registerToken(req, res) {
    try {
      const { token } = req.body;
      const userId = req.user.id;
      const userType = req.userType || 'user';

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Device token is required',
        });
      }

      const result = await notificationService.registerDeviceToken(userId, token, userType);
      
      res.json({
        success: true,
        message: 'Device token registered successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to register device token',
        error: error.message,
      });
    }
  }

  // Unregister device token
  async unregisterToken(req, res) {
    try {
      const { token } = req.body;
      const userId = req.user.id;
      const userType = req.userType || 'user';

      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Device token is required',
        });
      }

      const result = await notificationService.unregisterDeviceToken(userId, token, userType);
      
      res.json({
        success: true,
        message: 'Device token unregistered successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to unregister device token',
        error: error.message,
      });
    }
  }

  // Get user notifications
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const userType = req.userType || 'user';
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const type = req.query.type;

      let result;
      if (type) {
        const notifications = await notificationService.getUserNotificationsByType(
          userId, 
          userType, 
          type, 
          limit
        );
        result = {
          notifications,
          pagination: {
            page,
            limit,
            total: notifications.length,
            pages: 1,
          },
        };
      } else {
        result = await notificationService.getUserNotifications(userId, userType, page, limit);
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to get notifications',
        error: error.message,
      });
    }
  }

  // Mark notification as read
  async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const result = await notificationService.markNotificationAsRead(notificationId, userId);
      
      res.json({
        success: true,
        message: 'Notification marked as read',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        error: error.message,
      });
    }
  }

  // Mark all notifications as read
  async markAllAsRead(req, res) {
    try {
      const userId = req.user.id;
      const userType = req.userType || 'user';

      const result = await notificationService.markAllNotificationsAsRead(userId, userType);
      
      res.json({
        success: true,
        message: 'All notifications marked as read',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read',
        error: error.message,
      });
    }
  }

  // Delete notification
  async deleteNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.id;

      const result = await notificationService.deleteNotification(notificationId, userId);
      
      res.json({
        success: true,
        message: 'Notification deleted successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to delete notification',
        error: error.message,
      });
    }
  }

  // Clear all notifications
  async clearAllNotifications(req, res) {
    try {
      const userId = req.user.id;
      const userType = req.userType || 'user';

      const result = await notificationService.clearAllNotifications(userId, userType);
      
      res.json({
        success: true,
        message: 'All notifications cleared successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to clear all notifications',
        error: error.message,
      });
    }
  }

  // Get unread count
  async getUnreadCount(req, res) {
    try {
      const userId = req.user.id;
      const userType = req.userType || 'user';

      const count = await notificationService.getUnreadCount(userId, userType);
      
      res.json({
        success: true,
        data: { unreadCount: count },
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to get unread count',
        error: error.message,
      });
    }
  }

  // Send test notification (for development)
  async sendTestNotification(req, res) {
    try {
      const { title, body, type } = req.body;
      const userId = req.user.id;
      const userType = req.userType || 'user';

      if (!title || !body) {
        return res.status(400).json({
          success: false,
          message: 'Title and body are required',
        });
      }

      const notification = {
        title,
        body,
        type: type || 'general',
        data: {
          type: 'test_notification',
          timestamp: new Date().toISOString(),
        },
      };

      const result = await notificationService.sendNotificationToUser(userId, notification, userType);
      
      res.json({
        success: true,
        message: 'Test notification sent successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to send test notification',
        error: error.message,
      });
    }
  }

  // Send notification to multiple users (admin function)
  async sendToMultipleUsers(req, res) {
    try {
      const { userIds, title, body, type, data } = req.body;
      const userType = req.body.userType || 'user';

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'User IDs array is required',
        });
      }

      if (!title || !body) {
        return res.status(400).json({
          success: false,
          message: 'Title and body are required',
        });
      }

      const notification = {
        title,
        body,
        type: type || 'general',
        data: data || {},
      };

      const result = await notificationService.sendNotificationToMultipleUsers(
        userIds, 
        notification, 
        userType
      );
      
      res.json({
        success: true,
        message: 'Notifications sent successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to send notifications',
        error: error.message,
      });
    }
  }

  // Send order notification
  async sendOrderNotification(req, res) {
    try {
      const { orderId, notificationType, additionalData } = req.body;

      if (!orderId || !notificationType) {
        return res.status(400).json({
          success: false,
          message: 'Order ID and notification type are required',
        });
      }

      const result = await notificationService.sendOrderNotification(
        orderId, 
        notificationType, 
        additionalData || {}
      );
      
      res.json({
        success: true,
        message: 'Order notification sent successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to send order notification',
        error: error.message,
      });
    }
  }

  // Send payment notification
  async sendPaymentNotification(req, res) {
    try {
      const { userId, paymentType, paymentData } = req.body;
      const userType = req.body.userType || 'user';

      if (!userId || !paymentType || !paymentData) {
        return res.status(400).json({
          success: false,
          message: 'User ID, payment type, and payment data are required',
        });
      }

      const result = await notificationService.sendPaymentNotification(
        userId, 
        paymentType, 
        paymentData
      );
      
      res.json({
        success: true,
        message: 'Payment notification sent successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to send payment notification',
        error: error.message,
      });
    }
  }
}

export default new NotificationController();
