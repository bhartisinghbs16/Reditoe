/**
 * Campaign routes for admin marketing campaigns
 */
import express from 'express';
import {
  getCampaigns,
  getCampaignOverview,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  activateCampaign,
  pauseCampaign,
  resumeCampaign,
  cancelCampaign,
  getCampaignAnalytics,
  setCampaignStatus,
  previewTargeting,
  processScheduledCampaigns,
} from '../../controllers/admin/adminCampaignController.js';
import { protect, restrictTo } from '../../middleware/auth.js';
import {
  validateCampaignCreation,
  validateCampaignUpdate,
  validateCampaignActivation,
  validateCampaignControl,
  validateTargetingPreview,
  campaignRateLimit,
} from '../../middleware/marketingValidation.js';

const router = express.Router();

// Apply authentication and authorization to all routes
router.use(protect);
router.use(restrictTo('admin', 'marketing'));

// Campaign CRUD operations
router.get('/', getCampaigns);
router.get('/overview', getCampaignOverview);
router.post('/', campaignRateLimit(), validateCampaignCreation, createCampaign);
router.post('/preview-targeting', validateTargetingPreview, previewTargeting);
router.post('/process-scheduled', processScheduledCampaigns);
router.get('/:id', getCampaignById);
router.put('/:id', campaignRateLimit(), validateCampaignUpdate, updateCampaign);
router.delete('/:id', deleteCampaign);

// Campaign control operations
router.post('/:id/activate', validateCampaignActivation, activateCampaign);
router.post('/:id/pause', (req, res, next) => { req.body.action = 'pause'; next(); }, validateCampaignControl, pauseCampaign);
router.post('/:id/resume', (req, res, next) => { req.body.action = 'resume'; next(); }, validateCampaignControl, resumeCampaign);
router.post('/:id/cancel', (req, res, next) => { req.body.action = 'cancel'; next(); }, validateCampaignControl, cancelCampaign);

// Development endpoint to manually set campaign status (must come before generic routes)
router.post('/:id/set-status', setCampaignStatus);

// Campaign analytics
router.get('/:id/analytics', getCampaignAnalytics);

export default router;
