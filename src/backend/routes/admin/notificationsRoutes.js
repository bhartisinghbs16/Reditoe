/**
 * Admin notifications routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import {
  getNotifications,
  getNotificationById,
  createNotification,
  sendNotification,
  deleteNotification,
} from '../../controllers/admin/adminNotificationController.js';

const router = express.Router();

router.get('/', getNotifications);
router.get('/:id', getNotificationById);
router.post('/', createNotification);
router.patch('/:id/send', sendNotification);
router.delete('/:id', deleteNotification);

export default router;
