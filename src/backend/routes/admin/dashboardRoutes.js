import express from 'express';
const router = express.Router();
import * as dashboardController from '../../controllers/admin/dashboard.controller.js';
import { adminProtect } from '../../middleware/adminAuth.js';

// All dashboard routes require authentication and admin role
router.use(adminProtect);

// Dashboard Analytics
router.get('/analytics', dashboardController.getDashboardAnalytics);

// Revenue Trend
router.get('/revenue-trend', dashboardController.getRevenueTrend);

// Total Income
router.get('/total-income', dashboardController.getTotalIncome);

// Revenue Forecast
router.get('/revenue-forecast', dashboardController.getRevenueForecast);

// Order Cancellation Insights
router.get('/order-cancellations', dashboardController.getOrderCancellationInsights);

// New Customers
router.get('/new-customers', dashboardController.getNewCustomers);

// Daily Activity
router.get('/daily-activity', dashboardController.getDailyActivity);

// Notifications
router.get('/notifications', dashboardController.getNotifications);

// Profile Menu Items
router.get('/profile-menu', dashboardController.getProfileMenuItems);

// Blog Posts
router.get('/blog-posts', dashboardController.getBlogPosts);

export default router;
