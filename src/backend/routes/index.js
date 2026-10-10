/**
 * Central API router â€“ all /api/* routes
 */
import { getPublicBanners } from '../controllers/user/bannerController.js';
import express from 'express';
import {
  sendSignupCode,
  confirmSignupCode,
} from '../controllers/signupVerificationController.js';
import adminRoutes from './admin/index.js';
import authRoutes from './authRoutes.js';
import orderRoutes from './orderRoutes.js';
import restaurantRoutes from './restaurantRoutes.js';
import vendorRoutes from './vendorRoutes.js';
import riderRoutes from './riderRoutes.js';
import publicDataRoutes from './publicData.js';
import publicReviewsRoutes from './publicReviews.js';
import publicSettingsRoutes from './publicSettingsRoutes.js';
import searchRoutes from './searchRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import referralRoutes from './referralRoutes.js';
import refundRoutes from './refundRoutes.js';
import activityLogRoutes from './activityLogRoutes.js';
import userAnalyticsRoutes from './userAnalyticsRoutes.js';
import adminCommunicationRoutes from './adminCommunicationRoutes.js';
import userCommunicationRoutes from './userCommunicationRoutes.js';
import supportRoutes from './supportRoutes.js';
import locationRoutes from './user/locationRoutes.js';
import addressRoutes from './addressRoutes.js';
// Customer-facing endpoints the app needed and the API did not have.
import { membershipRouter, walletRouter, addressRouter } from './user/customerRoutes.js';
import { getMyRefunds, getMyRefundSummary, requestRefund } from '../controllers/user/myRefundController.js';
import { protect as protectUser } from '../middleware/auth.js';
import fileUploadRoutes from './fileUpload.js';
import notificationsRoutes from './notifications.js';
import locationTrackingRoutes from './location.js';
import paymentRoutes from './payments.js';
import liveTrackingRoutes from './liveTracking.js';
import pushNotificationRoutes from './pushNotifications.js';
import cuisinesRoutes from './cuisinesRoutes.js';
import { getSecretFingerprint } from '../utils/jwt.js';

const router = express.Router();

// â”€â”€â”€ Health & Info â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Vinsta Backend API is running',
    timestamp: new Date().toISOString(),
  });
});

if (process.env.NODE_ENV !== 'production') {
  router.post('/test', (req, res) => {
    const start = Date.now();
    res.status(200).json({
      ok: true,
      message: 'POST request working',
      receivedBody: req.body || {},
      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - start}ms`,
    });
  });
}

router.get('/version', (req, res) => {
  res.json({
    status: 'ok',
    service: 'vinsta-backend',
    nodeEnv: process.env.NODE_ENV || 'unset',
    nodeVersion: process.version,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    render: {
      serviceId: process.env.RENDER_SERVICE_ID || null,
      gitCommit: process.env.RENDER_GIT_COMMIT || null,
      instanceId: process.env.RENDER_INSTANCE_ID || null,
    },
  });
});

// â”€â”€â”€ Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.use('/admin', adminRoutes);

// â”€â”€â”€ Vendor â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.use('/vendor', vendorRoutes);

// â”€â”€â”€ Rider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.use('/rider', riderRoutes);

// â”€â”€â”€ User (customer) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.use('/auth', authRoutes);
console.log('âœ… Auth routes registered at /api/auth');
router.use('/orders', orderRoutes);
router.use('/restaurants', restaurantRoutes);

// GET /api/banners - the posters the admin has scheduled, for the apps.
router.get('/banners', getPublicBanners);
router.use('/cuisines', cuisinesRoutes);
router.use('/referrals', referralRoutes);
router.use('/referral', referralRoutes); // Alias for mobile compatibility
router.get('/refunds/my', protectUser, getMyRefunds);
router.get('/refunds/my/summary', protectUser, getMyRefundSummary);
// The customer raises a refund on their own order. Declared before the
// admin-scoped '/refunds' mount, which rejects a customer token outright.
router.post('/refunds/request', protectUser, requestRefund);
router.use('/refunds', refundRoutes);
/*
 * Verifying a contact detail before an account exists. Anonymous by
 * necessity: there is nobody to authenticate yet.
 */
router.post('/signup-verification/send', sendSignupCode);
router.post('/signup-verification/confirm', confirmSignupCode);

router.use('/support', supportRoutes);
router.use('/user', locationRoutes);
router.use('/membership', membershipRouter);
router.use('/wallet', walletRouter);
router.use('/addresses', addressRouter);
router.use('/', addressRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/user-analytics', userAnalyticsRoutes);
router.use('/activity-logs', activityLogRoutes);
router.use('/admin-communications', adminCommunicationRoutes);
router.use('/user-communications', userCommunicationRoutes);

// â”€â”€â”€ Public data (admin auth required) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.use('/public', publicSettingsRoutes);
router.use('/public-data', publicDataRoutes);
router.use('/reviews', publicReviewsRoutes);
router.use('/search', searchRoutes);

// â”€â”€â”€ Shared (upload, payments, tracking, notifications) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
router.use('/upload', fileUploadRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/location', locationTrackingRoutes);
router.use('/payments', paymentRoutes);
router.use('/tracking', liveTrackingRoutes);
router.use('/push-notifications', pushNotificationRoutes);

router.get('/debug/jwt-secret-fingerprint', (req, res) => {
  res.json({
    status: 'ok',
    fingerprint: getSecretFingerprint(),
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

router.use((req, res) => {
  res.status(404).json({
    status: 'error',
    message: 'API route not found',
    path: req.originalUrl || req.path,
    hint: 'Check the API documentation for available endpoints.',
  });
});

export default router;
