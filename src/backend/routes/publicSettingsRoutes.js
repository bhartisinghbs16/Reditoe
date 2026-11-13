import express from 'express';
import rateLimit from 'express-rate-limit';
import { requestAccountDeletion } from '../controllers/accountDeletionController.js';
import { getPublicSettings } from '../controllers/admin/adminSettingsController.js';

const router = express.Router();

router.get('/settings', getPublicSettings);

// The website's "delete my account" form. Anonymous by necessity, so limited.
router.post(
  '/account-deletion-request',
  rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please try again later.' },
  }),
  requestAccountDeletion
);

export default router;
