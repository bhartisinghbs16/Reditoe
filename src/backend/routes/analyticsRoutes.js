import express from 'express';
import { 
  getAnalyticsOverview, 
  getVendorAnalytics, 
  getRiderAnalytics 
} from '../controllers/analyticsController.js';
import { protect, adminAuth, vendorAuth, riderAuth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/analytics/overview - Get comprehensive analytics (admin only)
router.get('/overview', protect, adminAuth, getAnalyticsOverview);

// GET /api/analytics/vendor - Get vendor-specific analytics (vendor only)
router.get('/vendor', protect, vendorAuth, getVendorAnalytics);

// GET /api/analytics/rider - Get rider-specific analytics (rider only)
router.get('/rider', protect, riderAuth, getRiderAnalytics);

export default router;
