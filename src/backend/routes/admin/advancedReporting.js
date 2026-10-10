import express from 'express';
import { protect, adminAuth } from '../../middleware/auth.js';
import { adminProtect } from '../../middleware/adminAuth.js';
import advancedReportingController from '../../controllers/admin/advancedReportingController.js';

const router = express.Router();

// All routes require admin authentication
router.use(protect);
router.use(adminProtect);

// Revenue analytics
router.get('/revenue', advancedReportingController.getRevenueAnalytics);

// Vendor commission analytics
router.get('/vendor-commissions', advancedReportingController.getVendorCommissionAnalytics);

// Rider payout analytics
router.get('/rider-payouts', advancedReportingController.getRiderPayoutAnalytics);

// Refund analytics
router.get('/refunds', advancedReportingController.getRefundAnalytics);

// Active users analytics
router.get('/active-users', advancedReportingController.getActiveUsersAnalytics);

// Order heatmap
router.get('/order-heatmap', advancedReportingController.getOrderHeatmap);

// Comprehensive dashboard
router.get('/dashboard', advancedReportingController.getDashboardAnalytics);

export default router;
