/**
 * Advanced Analytics Routes for deep BI insights
 * All protected by rbac middleware
 */
import express from 'express';
import {
  getAnalyticsOverview,
  getProfitBreakdown,
  getTrendAnalysis,
  getGeographicHeatmap,
  getVendorPerformance,
  exportAnalytics,
} from '../../controllers/admin/adminAdvancedAnalyticsController.js';
import { rbacProtect, requirePermission } from '../../middleware/rbac.js';

const router = express.Router();

// Apply RBAC protection to all routes
router.use(rbacProtect);

// Analytics overview (all admin roles can read)
router.get('/overview', requirePermission('analytics:read'), getAnalyticsOverview);

// Profit breakdown (finance admin and super admin)
router.get('/profit-breakdown', requirePermission('financial:read'), getProfitBreakdown);

// Trend analysis (all admin roles can read)
router.get('/trends', requirePermission('analytics:read'), getTrendAnalysis);

// Geographic heatmap (all admin roles can read)
router.get('/heatmap', requirePermission('analytics:read'), getGeographicHeatmap);

// Vendor performance (all admin roles can read)
router.get('/vendor-performance', requirePermission('vendors:read'), getVendorPerformance);

// Export analytics (finance admin and super admin)
router.get('/export', requirePermission('analytics:read'), exportAnalytics);

export default router;
