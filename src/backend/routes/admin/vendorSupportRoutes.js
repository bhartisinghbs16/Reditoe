/**
 * Admin Vendor Support Tickets routes
 */
import express from 'express';
import {
  getSupportTickets,
  getSupportTicketById,
  addTicketMessage,
  updateTicketStatus,
  assignTicket,
  closeTicket,
  createSupportTicket,
} from '../../controllers/admin/vendorSupportController.js';

const router = express.Router();

// GET /api/admin/vendor-support - Get all support tickets with filtering
router.get('/', getSupportTickets);

// GET /api/admin/vendor-support/:id - Get single support ticket
router.get('/:id', getSupportTicketById);

// POST /api/admin/vendor-support - Create new support ticket
router.post('/', createSupportTicket);

// POST /api/admin/vendor-support/:id/messages - Add message to ticket
router.post('/:id/messages', addTicketMessage);

// PATCH /api/admin/vendor-support/:id/status - Update ticket status
router.patch('/:id/status', updateTicketStatus);

// PATCH /api/admin/vendor-support/:id/assign - Assign ticket to admin
router.patch('/:id/assign', assignTicket);

// PATCH /api/admin/vendor-support/:id/close - Close ticket
router.patch('/:id/close', closeTicket);

export default router;
