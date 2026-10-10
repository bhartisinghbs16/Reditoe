import express from 'express';
import { globalSearch, searchById } from '../../controllers/admin/adminGlobalSearchController.js';

const router = express.Router();

// GET /api/admin/search?q=<query> - Global search with autocomplete
router.get('/', globalSearch);

// GET /api/admin/search/:id - Search by exact ID for direct navigation
router.get('/:id', searchById);

export default router;
