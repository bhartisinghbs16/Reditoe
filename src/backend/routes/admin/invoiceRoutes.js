/**
 * Invoice Routes - Complete Invoice Management System
 */
import express from 'express';
import {
  generateInvoiceFromOrder,
  getInvoices,
  getInvoiceById,
  updateInvoiceStatus,
  processInvoiceRefund,
  downloadInvoicePDF,
  getInvoiceStatistics
} from '../../controllers/admin/invoiceController.js';
import { adminProtect } from '../../middleware/adminAuth.js';
import { requirePermission } from '../../middleware/rbac.js';

const router = express.Router();

// Apply admin authentication to all routes
router.use(adminProtect);

// GET /admin/invoices - Get all invoices with filtering
router.get('/', requirePermission('invoices:read'), getInvoices);

// GET /admin/invoices/statistics - Get invoice statistics
router.get('/statistics', requirePermission('invoices:read'), getInvoiceStatistics);

// POST /admin/invoices/generate-from-order - Generate invoice from order
router.post('/generate-from-order', requirePermission('invoices:create'), generateInvoiceFromOrder);

// GET /admin/invoices/:id - Get single invoice by ID
router.get('/:id', requirePermission('invoices:read'), getInvoiceById);

// PATCH /admin/invoices/:id/status - Update invoice status
router.patch('/:id/status', requirePermission('invoices:update'), updateInvoiceStatus);

// POST /admin/invoices/:id/refund - Process invoice refund
router.post('/:id/refund', requirePermission('invoices:update'), processInvoiceRefund);

// GET /admin/invoices/:id/pdf-download - Download invoice PDF
router.get('/:id/pdf-download', requirePermission('invoices:read'), downloadInvoicePDF);

export default router;
