import express from 'express';
import { protect } from '../middleware/auth.js';
import liveTrackingController from '../controllers/liveTrackingController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Customer tracking endpoints
router.post('/track/:orderId', liveTrackingController.startTracking);
router.post('/stop/:orderId', liveTrackingController.stopTracking);
router.get('/status/:orderId', liveTrackingController.getTrackingStatus);

// Rider location endpoints
router.post('/location/:orderId', liveTrackingController.updateRiderLocation);
router.get('/rider/active-orders', liveTrackingController.getRiderActiveOrders);
router.get('/rider/location-history/:riderId', liveTrackingController.getRiderLocationHistory);

// Admin endpoints
router.get('/admin/stats', liveTrackingController.getTrackingStats);
router.get('/admin/active-trackings', liveTrackingController.getActiveTrackings);

export default router;
