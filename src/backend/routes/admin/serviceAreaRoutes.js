import express from 'express';
import {
  listServiceAreas,
  saveServiceArea,
  setStateActive,
  setStateOffice,
  getServiceMap,
  deleteServiceArea,
} from '../../controllers/admin/adminServiceAreaController.js';

/**
 * Where the platform trades. Cities are created and updated through one
 * route, because a city exists once in a state.
 */
const router = express.Router();

router.get('/', listServiceAreas);
// Before /:id, so "map" is not read as an id.
router.get('/map', getServiceMap);
router.post('/', saveServiceArea);
// Before /:id, or "state" is read as an id.
router.patch('/state', setStateActive);
router.patch('/state-office', setStateOffice);
router.delete('/:id', deleteServiceArea);

export default router;
