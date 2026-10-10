/**
 * Admin Vendor Settlements routes
 */
import express from 'express';
import {
  getSettlements,
  getSettlementById,
  approveSettlement,
  processSettlement,
  rejectSettlement,
  generateSettlement,
  getSettlementSummary,
  downloadSettlementDocument,
} from '../../controllers/admin/vendorSettlementController.js';

const router = express.Router();

// GET /api/admin/vendor-settlements - Get all settlements with filtering
router.get('/', getSettlements);

// GET /api/admin/vendor-settlements/summary - Get settlements summary
router.get('/summary', getSettlementSummary);

// GET /api/admin/vendor-settlements/:id - Get single settlement
router.get('/:id', getSettlementById);

// POST /api/admin/vendor-settlements/generate - Generate new settlement
router.post('/generate', generateSettlement);

// PATCH /api/admin/vendor-settlements/:id/approve - Approve settlement
router.patch('/:id/approve', approveSettlement);

// PATCH /api/admin/vendor-settlements/:id/process - Process/settle payment
router.patch('/:id/process', processSettlement);

// PATCH /api/admin/vendor-settlements/:id/reject - Reject settlement
router.patch('/:id/reject', rejectSettlement);

// GET /api/admin/vendor-settlements/:id/documents/:type - Download settlement document
router.get('/:id/documents/:type', downloadSettlementDocument);

export default router;
