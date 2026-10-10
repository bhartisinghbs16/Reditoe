import express from 'express';
import { protect } from '../middleware/auth.js';
import pushNotificationController from '../controllers/pushNotificationController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Device token management
router.post('/token', pushNotificationController.storeToken);
router.delete('/token', pushNotificationController.removeToken);

// User notification endpoints
router.post('/test', pushNotificationController.sendTestNotification);
router.get('/stats', pushNotificationController.getStats);

// Admin endpoints
router.post('/promotional', protect, pushNotificationController.sendPromotional);
router.post('/broadcast', protect, pushNotificationController.sendBroadcast);

export default router;
