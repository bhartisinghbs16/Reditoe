import express from 'express';
import { protect } from '../middleware/auth.js';
import { getUserCommunications, sendMessageToAdmin } from '../controllers/userCommunicationController.js';

const router = express.Router();

// All user communication routes require authentication
router.use(protect);

// Get user's communications
router.get('/', getUserCommunications);

// Send message to admin/vendor
router.post('/send', sendMessageToAdmin);

export default router;
