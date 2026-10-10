import express from 'express';
import { adminAuth } from '../../middleware/auth.js';
import { protect } from '../../middleware/auth.js';
import { getSupportTickets, getSupportTicketById, updateTicketStatus } from '../../controllers/admin/userSupportController.js';
import { addTicketMessage } from '../../controllers/user/supportController.js';

const router = express.Router();

router.use(protect, adminAuth);

router.route('/')
  .get(getSupportTickets);

router.route('/:id')
  .get(getSupportTicketById);

router.route('/:id/status')
  .patch(updateTicketStatus);

// Reuse the exact same controller method for message replies
router.route('/:id/messages')
  .post(addTicketMessage);

export default router;
