import express from 'express';
import {
  uploadKycDocument,
  getKycStatus,
  deleteKycDocument,
} from '../controllers/vendorKycController.js';
import { authenticateToken, requireVendor } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = express.Router();

// Apply authentication and vendor requirement to all routes
router.use(authenticateToken);
router.use(requireVendor);

// Get KYC status and documents
router.get('/status', getKycStatus);

// Upload KYC document
router.post('/upload', upload.single('document'), uploadKycDocument);

// Delete KYC document
router.delete('/:documentType', deleteKycDocument);

export default router;
