/**
 * Admin Vendor Analytics routes
 */
import express from 'express';
import {
  getVendorAnalytics,
  getVendorAnalyticsById,
  getAnalyticsSummary,
  getPerformanceMetrics,
  getSalesTrends,
  getVendorRankings,
  exportAnalytics,
} from '../../controllers/admin/vendorAnalyticsController.js';

const router = express.Router();

// GET /api/admin/vendor-analytics - Get all vendors analytics with filtering
router.get('/', getVendorAnalytics);

// GET /api/admin/vendor-analytics/summary - Get analytics summary
router.get('/summary', getAnalyticsSummary);

// GET /api/admin/vendor-analytics/performance - Get performance metrics
router.get('/performance', getPerformanceMetrics);

// GET /api/admin/vendor-analytics/rankings - Get vendor rankings
router.get('/rankings', getVendorRankings);

// GET /api/admin/vendor-analytics/trends - Get sales trends
router.get('/trends', getSalesTrends);

// GET /api/admin/vendor-analytics/export - Export analytics data
router.get('/export', exportAnalytics);

// GET /api/admin/vendor-analytics/:id - Get single vendor analytics
router.get('/:id', getVendorAnalyticsById);

export default router;
