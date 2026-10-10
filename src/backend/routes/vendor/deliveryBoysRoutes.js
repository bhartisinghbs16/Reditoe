/**
 * Vendor Delivery Boys routes
 */
import express from 'express';
import {
  getMyDeliveryBoys,
  createMyDeliveryBoy,
  getMyDeliveryBoyById,
  updateMyDeliveryBoy,
  updateMyDeliveryBoyStatus,
  getAvailableDeliveryBoys,
} from '../../controllers/vendor/vendorDeliveryBoyController.js';

const router = express.Router();

router.get('/my', getMyDeliveryBoys);
router.get('/available', getAvailableDeliveryBoys);
router.post('/create', createMyDeliveryBoy);
router.get('/:id', getMyDeliveryBoyById);
router.put('/:id', updateMyDeliveryBoy);
router.patch('/:id/status', updateMyDeliveryBoyStatus);

export default router;
