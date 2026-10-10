import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';
import pushNotificationService from '../services/pushNotificationService.js';
import pushNotificationQueue from '../utils/pushNotificationQueue.js';
import NotificationLog from '../models/NotificationLog.js';

class PushNotificationController {
  // Store FCM token
  async storeToken(req, res) {
    try {
      const { token, deviceInfo } = req.body;
      const userId = req.user.id;

      if (!token) {
        return res.status(400).json({
          status: 'error',
          message: 'FCM token is required'
        });
      }

      await pushNotificationService.storeDeviceToken(userId, token, deviceInfo);

      res.json({
        status: 'success',
        message: 'FCM token stored successfully'
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to store FCM token'
      });
    }
  }

  // Remove FCM token
  async removeToken(req, res) {
    try {
      const { token } = req.body;
      const userId = req.user.id;

      if (!token) {
        return res.status(400).json({
          status: 'error',
          message: 'FCM token is required'
        });
      }

      await pushNotificationService.removeDeviceToken(userId, token);

      res.json({
        status: 'success',
        message: 'FCM token removed successfully'
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to remove FCM token'
      });
    }
  }

  // Send test notification
  async sendTestNotification(req, res) {
    try {
      const userId = req.user.id;

      const success = await pushNotificationService.sendTestNotification(userId);

      res.json({
        status: 'success',
        message: success ? 'Test notification sent successfully' : 'Failed to send test notification',
        data: { delivered: success }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to send test notification'
      });
    }
  }

  // Get notification statistics
  async getStats(req, res) {
    try {
      // Only admins can access stats
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Admin access required'
        });
      }

      const stats = await pushNotificationService.getNotificationStats();

      res.json({
        status: 'success',
        data: stats
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get notification statistics'
      });
    }
  }

  // Send promotional notification (admin only)
  async sendPromotional(req, res) {
    try {
      // Only admins can send promotional notifications
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Admin access required'
        });
      }

      const { 
        title, 
        body, 
        imageUrl, 
        targetUsers, 
        targetSegment,
        targetCity,
        data = {} 
      } = req.body;

      if (!title || !body) {
        return res.status(400).json({
          status: 'error',
          message: 'Title and body are required'
        });
      }

      let targetUserIds = [];

      // Determine target users
      if (targetUsers && Array.isArray(targetUsers)) {
        // Specific user IDs
        targetUserIds = targetUsers;
      } else if (targetSegment) {
        // Target by segment
        const segmentQuery = this.getSegmentQuery(targetSegment, targetCity);
        const users = await User.find(segmentQuery).select('_id');
        targetUserIds = users.map(u => u._id);
      } else {
        // All users with tokens
        const users = await User.find({ 
          'fcmTokens.0': { $exists: true } 
        }).select('_id');
        targetUserIds = users.map(u => u._id);
      }

      if (targetUserIds.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No target users found'
        });
      }

      const notification = { title, body, imageUrl };
      const success = await pushNotificationService.sendPromotionalNotification(
        targetUserIds, 
        notification, 
        data
      );

      res.json({
        status: 'success',
        message: 'Promotional notification sent',
        data: {
          targetCount: targetUserIds.length,
          delivered: success
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to send promotional notification'
      });
    }
  }

  // Send broadcast notification (admin only)
  async sendBroadcast(req, res) {
    try {
      // Only admins can send broadcasts
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Admin access required'
        });
      }

      const { title, body, data = {} } = req.body;

      if (!title || !body) {
        return res.status(400).json({
          status: 'error',
          message: 'Title and body are required'
        });
      }

      // Get all users with FCM tokens
      const users = await User.find({ 
        'fcmTokens.0': { $exists: true } 
      }).select('_id');

      const targetUserIds = users.map(u => u._id);

      if (targetUserIds.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No users with FCM tokens found'
        });
      }

      const notification = { title, body };
      const success = await pushNotificationService.sendToMultipleUsers(
        targetUserIds, 
        notification, 
        { type: 'broadcast', ...data }
      );

      res.json({
        status: 'success',
        message: 'Broadcast notification sent',
        data: {
          targetCount: targetUserIds.length,
          delivered: success
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to send broadcast notification'
      });
    }
  }

  // Get segment query for targeted notifications
  getSegmentQuery(segment, city) {
    const baseQuery = { 'fcmTokens.0': { $exists: true } };

    switch (segment) {
      case 'all_users':
        return baseQuery;
      
      case 'active_users':
        return {
          ...baseQuery,
          lastActiveAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
        };
      
      case 'vendors':
        return {
          ...baseQuery,
          role: 'vendor'
        };
      
      case 'riders':
        return {
          ...baseQuery,
          role: 'rider'
        };
      
      case 'customers':
        return {
          ...baseQuery,
          role: 'user'
        };
      
      default:
        return baseQuery;
    }
  }
}

export default new PushNotificationController();
