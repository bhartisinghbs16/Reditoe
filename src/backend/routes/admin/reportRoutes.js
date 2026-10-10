/**
 * Report Routes - Advanced Reporting System
 */
import express from 'express';
import {
  generateReport,
  getReports,
  getReportById,
  downloadReport,
  deleteReport,
  getReportTemplates
} from '../../controllers/admin/reportController.js';
import { adminProtect } from '../../middleware/adminAuth.js';
import { requirePermission } from '../../middleware/rbac.js';

const router = express.Router();

// Apply admin authentication to all routes
router.use(adminProtect);

// GET /admin/advanced-reports/templates - Get report templates
router.get('/templates', getReportTemplates);

// GET /admin/reports - Get all reports
router.get('/', getReports);

// POST /admin/reports/generate - Generate new report
router.post('/generate', generateReport);

// GET /admin/reports/:id - Get single report by ID
router.get('/:id', getReportById);

// GET /admin/reports/:id/download - Download report file
router.get('/:id/download', downloadReport);

// DELETE /admin/reports/:id - Delete report
router.delete('/:id', deleteReport);

export default router;
