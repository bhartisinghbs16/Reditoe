/**
 * Admin API routes. All under /api/admin.
 * Public: login, forgot-password, reset-password.
 * All other routes protected by adminProtect.
 */
import express from 'express';
import { adminProtect } from '../../middleware/adminAuth.js';
import { recordAdminActivity } from '../../middleware/activityLogger.js';
import authRoutes from './authRoutes.js';
import { getIntegrationStatus } from '../../controllers/admin/adminIntegrationsController.js';
import { getKnownLocations } from '../../controllers/admin/adminLocationsController.js';
import dashboardRoutes from './dashboardRoutes.js';
import ordersRoutes from './ordersRoutes.js';
import ridersRoutes from './ridersRoutes.js';
import menuRoutes from './menuRoutes.js';
import notificationsRoutes from './notificationsRoutes.js';
import restaurantsRoutes from './restaurantsRoutes.js';
import vendorSupportRoutes from './vendorSupportRoutes.js';
import vendorSettlementsRoutes from './vendorSettlementsRoutes.js';
import vendorAnalyticsRoutes from './vendorAnalyticsRoutes.js';
import reviewsRoutes from './reviewsRoutes.js';
import usersRoutes from './usersRoutes.js';
import payoutsRoutes from './payoutsRoutes.js';
import reportsRoutes from './reportsRoutes.js';
import paymentsRoutes from './paymentsRoutes.js';
import settingsRoutes from './settingsRoutes.js';
import gstRoutes from './gstRoutes.js';
import serviceAreaRoutes from './serviceAreaRoutes.js';
import marketingRoutes from './marketingRoutes.js';
import campaignRoutes from './campaignRoutes.js';
import rbacRoutes from './rbacRoutes.js';
import invoiceRoutes from './invoiceRoutes.js';
import reportRoutes from './reportRoutes.js';
import advancedAnalyticsRoutes from './advancedAnalyticsRoutes.js';
import analyticsRoutes from './analytics.js';
import organizationRoutes from './organizationRoutes.js';
import backupRoutes from './backupRoutes.js';
import emailRoutes from './emailRoutes.js';
import fileUploadRoutes from './fileUploadRoutes.js';
import cacheRoutes from './cacheRoutes.js';
import refundRoutes from './refundsRoutes.js';
import disputeRoutes from './disputesRoutes.js';
import tasksRoutes from './tasksRoutes.js';
import globalSearchRoutes from './globalSearchRoutes.js';
import deliveryBoysRoutes from './deliveryBoysRoutes.js';
import ridersTrackingRoutes from './ridersTrackingRoutes.js';
import riderWithdrawalsRoutes from './riderWithdrawalsRoutes.js';
import bulkOperationsRoutes from './bulkOperations.js';
import advancedReportingRoutes from './advancedReporting.js';
import vendorWithdrawalsRoutes from './vendorWithdrawalsRoutes.js';
import adminIncentivesRoutes from './adminIncentivesRoutes.js';
import couponRoutes from './couponRoutes.js';
import userSupportRoutes from './userSupportRoutes.js';

const router = express.Router();

// Direct admin login route for compatibility - mount first
import { adminLogin } from '../../controllers/admin/adminAuthController.js';
router.post('/login', adminLogin);

// Public routes (no auth required) - mount first
router.use('/auth', authRoutes);

// What the API is actually wired up to, read from the API rather than guessed
// from tick-boxes in the settings document.
router.get('/system/integrations', adminProtect, getIntegrationStatus);

// The cities and states this platform actually has data for, for the filters.
router.get('/locations', adminProtect, getKnownLocations);

/*
 * Every admin write leaves a trace.
 *
 * Mounted before the groups so the listener is registered early; it writes
 * after the response, by which time adminProtect has said who was asking.
 */
router.use(recordAdminActivity);

// Protected routes (admin only) - apply adminProtect to each route group
router.use('/dashboard', adminProtect, dashboardRoutes);
router.use('/orders', adminProtect, ordersRoutes);
router.use('/restaurants', adminProtect, restaurantsRoutes);
router.use('/gst', adminProtect, gstRoutes);
router.use('/service-areas', adminProtect, serviceAreaRoutes);
router.use('/vendor-support', adminProtect, vendorSupportRoutes);
router.use('/vendor-settlements', adminProtect, vendorSettlementsRoutes);
router.use('/vendor-analytics', adminProtect, vendorAnalyticsRoutes);
router.use('/reviews', adminProtect, reviewsRoutes);
router.use('/users', adminProtect, usersRoutes);
router.use('/riders', adminProtect, ridersRoutes);
router.use('/payouts', adminProtect, payoutsRoutes);
router.use('/payments', adminProtect, paymentsRoutes);
router.use('/notifications', adminProtect, notificationsRoutes);
router.use('/menu-items', adminProtect, menuRoutes);
router.use('/settings', adminProtect, settingsRoutes);
router.use('/marketing', adminProtect, marketingRoutes);
router.use('/campaigns', adminProtect, campaignRoutes);
router.use('/coupons', adminProtect, couponRoutes);
router.use('/incentives', adminProtect, adminIncentivesRoutes);

router.use('/rbac', adminProtect, rbacRoutes);

router.use('/reports', adminProtect, reportsRoutes);
router.use('/invoices', adminProtect, invoiceRoutes);
router.use('/advanced-reports', adminProtect, reportRoutes);
router.use('/user-support', adminProtect, userSupportRoutes);
// analyticsRoutes first (revenue, orders, etc.) - before advancedAnalyticsRoutes
router.use('/analytics', adminProtect, analyticsRoutes);
router.use('/analytics', adminProtect, advancedAnalyticsRoutes);
router.use('/organizations', adminProtect, organizationRoutes);
router.use('/backups', adminProtect, backupRoutes);
router.use('/emails', adminProtect, emailRoutes);
router.use('/files', adminProtect, fileUploadRoutes);
router.use('/cache', adminProtect, cacheRoutes);
router.use('/refunds', adminProtect, refundRoutes);
router.use('/disputes', adminProtect, disputeRoutes);
router.use('/tasks', adminProtect, tasksRoutes);
router.use('/search', adminProtect, globalSearchRoutes);
router.use('/delivery-boys', adminProtect, deliveryBoysRoutes);
router.use('/riders/tracking', adminProtect, ridersTrackingRoutes);
router.use('/rider-withdrawals', adminProtect, riderWithdrawalsRoutes);
router.use('/vendor-withdrawals', adminProtect, vendorWithdrawalsRoutes);
router.use('/bulk-operations', adminProtect, bulkOperationsRoutes);
router.use('/advanced-reporting', adminProtect, advancedReportingRoutes);

// Catch-all for unmatched admin routes - prevents breaking on unknown paths
router.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'Admin route not found',
    path: req.originalUrl || req.path,
    hint: 'Check the API documentation for available admin endpoints.',
  });
});

export default router;
