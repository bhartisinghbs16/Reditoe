/**
 * Admin Rider Tracking Routes
 * Routes for real-time rider tracking and location management
 */

import express from 'express';
import {
  getLiveRiderLocations,
  getRiderLocationHistory,
  getRiderTrackingStats,
  getRiderCurrentRoute
} from '../../controllers/admin/adminRiderTrackingController.js';

const router = express.Router();

// GET /admin/riders/tracking/live - Get live locations of all online riders
router.get('/live', getLiveRiderLocations);

// GET /admin/riders/tracking/history/:riderId - Get location history for a specific rider
router.get('/history/:riderId', getRiderLocationHistory);

// GET /admin/riders/tracking/stats - Get rider tracking statistics
router.get('/stats', getRiderTrackingStats);

// GET /admin/riders/tracking/route/:riderId - Get current route/trajectory for a rider
router.get('/route/:riderId', getRiderCurrentRoute);

export default router;
