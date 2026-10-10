import express from 'express';
import { search, getSearchSuggestions } from '../controllers/user/searchController.js';

const router = express.Router();

// Main search endpoint - GET /api/search
router.get('/', search);

// Search suggestions - GET /api/search/suggestions
router.get('/suggestions', getSearchSuggestions);

export default router;
