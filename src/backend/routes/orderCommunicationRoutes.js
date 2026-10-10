import express from 'express';
import { protect } from '../middleware/auth.js';
import {
  getOrderCommunication,
  sendOrderCommunicationMessage,
  getOrderCommunicationCall,
} from '../controllers/orderCommunicationController.js';

const router = express.Router({ mergeParams: true });

router.get('/', protect, getOrderCommunication);
router.post('/messages', protect, sendOrderCommunicationMessage);
router.post('/call', protect, getOrderCommunicationCall);

export default router;
