import express from 'express';
import { protect } from '../middleware/auth.js';
import { uploadToS3 } from '../config/s3Upload.js';
import { 
  createSupportTicket, 
  getUserSupportTickets, 
  getSupportTicketById, 
  addTicketMessage,
  uploadTicketFile,
  getTicketFiles
} from '../controllers/user/supportController.js';

const router = express.Router();

const upload = uploadToS3('support-tickets');

// All support routes require authentication
router.use(protect);

// Create support ticket - POST /api/support/tickets
router.post('/tickets', createSupportTicket);

// Get user's support tickets - GET /api/support/tickets
router.get('/tickets', getUserSupportTickets);

// Get single support ticket - GET /api/support/tickets/:id
router.get('/tickets/:id', getSupportTicketById);

// Add message to ticket - POST /api/support/tickets/:id/message
router.post('/tickets/:id/message', addTicketMessage);

// Upload file for ticket - POST /api/support/tickets/:id/upload
router.post('/tickets/:id/upload', upload.single('file'), uploadTicketFile);

// Get ticket files - GET /api/support/tickets/:id/files
router.get('/tickets/:id/files', getTicketFiles);

export default router;
