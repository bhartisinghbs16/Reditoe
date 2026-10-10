/**
 * Admin payouts routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import {
  getPayouts,
  generatePayouts,
  getPayoutById,
  updatePayoutStatus,
} from '../../controllers/admin/adminPayoutController.js';

const router = express.Router();

router.get('/', getPayouts);
router.post('/generate', generatePayouts);
router.patch('/:id/status', updatePayoutStatus);
router.get('/:id', getPayoutById);

export default router;
