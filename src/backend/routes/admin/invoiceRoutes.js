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
import { requireAnyPermission } from '../../middleware/rbac.js';

const router = express.Router();

// Apply admin authentication to all routes
router.use(adminProtect);

// GET /admin/invoices - Get all invoices with filtering
router.get('/', requireAnyPermission('invoices:read', 'financial:read'), getInvoices);

// GET /admin/invoices/statistics - Get invoice statistics
router.get('/statistics', requireAnyPermission('invoices:read', 'financial:read'), getInvoiceStatistics);

// POST /admin/invoices/generate-from-order - Generate invoice from order
router.post('/generate-from-order', requireAnyPermission('invoices:create', 'financial:create'), generateInvoiceFromOrder);

// GET /admin/invoices/:id - Get single invoice by ID
router.get('/:id', requireAnyPermission('invoices:read', 'financial:read'), getInvoiceById);

// PATCH /admin/invoices/:id/status - Update invoice status
router.patch('/:id/status', requireAnyPermission('invoices:update', 'financial:update'), updateInvoiceStatus);

// POST /admin/invoices/:id/refund - Process invoice refund
router.post('/:id/refund', requireAnyPermission('invoices:update', 'financial:update'), processInvoiceRefund);

// GET /admin/invoices/:id/pdf-download - Download invoice PDF
router.get('/:id/pdf-download', requireAnyPermission('invoices:read', 'financial:read'), downloadInvoicePDF);

export default router;
