/**
 * Admin menu (food items) routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import { uploadToS3 } from '../../config/s3Upload.js';
import {
  getMenuItems,
  getMenuItemById,
  createMenuItem,
  updateMenuItem,
  updateMenuItemStatus,
  deleteMenuItem,
  uploadMenuItemImage,
} from '../../controllers/admin/adminMenuController.js';

const router = express.Router();

const upload = uploadToS3('menu-images');

router.post('/upload-image', upload.single('image'), uploadMenuItemImage);
router.get('/', getMenuItems);
router.get('/:id', getMenuItemById);
router.post('/', createMenuItem);
router.put('/:id', updateMenuItem);
router.patch('/:id/status', updateMenuItemStatus);
router.delete('/:id', deleteMenuItem);

export default router;

