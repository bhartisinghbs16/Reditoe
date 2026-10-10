import express from 'express';
import { protect } from '../middleware/auth.js';
import notificationController from '../controllers/notificationController.js';
import pushNotificationController from '../controllers/pushNotificationController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// FCM Token management
router.post('/register-token', pushNotificationController.storeToken);
router.post('/unregister-token', pushNotificationController.removeToken);

// Notification management
router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/:notificationId/read', notificationController.markAsRead);
router.patch('/mark-all-read', notificationController.markAllAsRead);
router.delete('/:notificationId', notificationController.deleteNotification);
router.delete('/', notificationController.clearAllNotifications);

// Test and admin functions
router.post('/test', notificationController.sendTestNotification);
router.post('/send-to-multiple', notificationController.sendToMultipleUsers);
router.post('/send-order', notificationController.sendOrderNotification);
router.post('/send-payment', notificationController.sendPaymentNotification);

// Admin-only push notification functions
router.post('/promotional', pushNotificationController.sendPromotional);
router.post('/broadcast', pushNotificationController.sendBroadcast);
router.get('/stats', pushNotificationController.getStats);

export default router;
