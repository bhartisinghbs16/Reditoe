import express from 'express';
const router = express.Router();

import {
  createIncentiveTemplate,
  updateIncentiveTemplate,
  getIncentiveTemplates,
  getIncentiveTemplate,
  deleteIncentiveTemplate,
  toggleIncentiveTemplate,
  assignIncentiveToRiders,
  getIncentiveStats,
  createSampleTemplates
} from '../../controllers/admin/adminIncentiveTemplateController.js';

// Incentive Template Management
router.post('/templates', createIncentiveTemplate);
router.get('/templates', getIncentiveTemplates);
router.get('/templates/:id', getIncentiveTemplate);
router.put('/templates/:id', updateIncentiveTemplate);
router.delete('/templates/:id', deleteIncentiveTemplate);
router.patch('/templates/:id/toggle', toggleIncentiveTemplate);

// Incentive Assignment
router.post('/templates/:id/assign', assignIncentiveToRiders);

// Statistics and Analytics
router.get('/stats', getIncentiveStats);

// Sample Data
router.post('/create-samples', createSampleTemplates);

export default router;
