import express from 'express';
import {
  listStateGst,
  saveStateGst,
  deleteStateGst,
} from '../../controllers/admin/adminGstController.js';

/**
 * The platform's GST registrations, one per state.
 *
 * There is no separate create and update: a state has one registration, so
 * saving the same state twice replaces it.
 */
const router = express.Router();

router.get('/', listStateGst);
router.post('/', saveStateGst);
router.delete('/:id', deleteStateGst);

export default router;
