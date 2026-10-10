/**
 * Admin reports routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import { 
  getReports, 
  getRestaurantPerformance,
  getProfitDashboard,
  getPeakTimeAnalysis,
  getHeatmapData,
  getExportData
} from '../../controllers/admin/adminReportController.js';

const router = express.Router();

router.get('/', getReports);
router.get('/restaurant-performance', getRestaurantPerformance);
router.get('/profit-dashboard', getProfitDashboard);
router.get('/peak-time', getPeakTimeAnalysis);
router.get('/heatmap', getHeatmapData);
router.get('/export', getExportData);

export default router;
