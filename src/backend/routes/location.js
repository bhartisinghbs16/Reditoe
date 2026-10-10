import express from 'express';
import { protect } from '../middleware/auth.js';
import locationController from '../controllers/locationController.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Location update and tracking
router.post('/update', locationController.updateLocation);
router.get('/order/:orderId', locationController.getOrderTracking);
router.post('/start-tracking', locationController.startTracking);
router.post('/stop-tracking', locationController.stopTracking);

// Rider location
router.get('/rider/:riderId', locationController.getRiderLocation);

// Location history
router.get('/history/:orderId', locationController.getLocationHistory);

// Utilities
router.post('/calculate-distance', locationController.calculateDistance);

// Admin functions
router.get('/active-tracking', locationController.getActiveTracking);
router.post('/cleanup', locationController.cleanupTrackingData);

export default router;
