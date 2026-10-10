/**
 * Admin Rider Analytics Routes
 * Routes for rider performance analytics and insights
 */

import express from 'express';
import {
  getRiderPerformanceAnalytics,
  getRiderLeaderboard,
  getRiderTrends,
  getRiderAnalyticsSummary
} from '../../controllers/admin/adminRiderAnalyticsController.js';

const router = express.Router();

// GET /admin/riders/analytics/performance - Get rider performance analytics
router.get('/performance', getRiderPerformanceAnalytics);

// GET /admin/riders/analytics/leaderboard - Get rider performance leaderboard
router.get('/leaderboard', getRiderLeaderboard);

// GET /admin/riders/analytics/trends - Get rider performance trends over time
router.get('/trends', getRiderTrends);

// GET /admin/riders/analytics/summary - Get overall rider analytics summary
router.get('/summary', getRiderAnalyticsSummary);

export default router;
