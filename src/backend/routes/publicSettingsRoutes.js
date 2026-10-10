import express from 'express';
import { getPublicSettings } from '../controllers/admin/adminSettingsController.js';

const router = express.Router();

router.get('/settings', getPublicSettings);

export default router;
