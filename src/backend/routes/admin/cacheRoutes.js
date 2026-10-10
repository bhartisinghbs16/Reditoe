/**
 * Cache Routes for Redis cache management
 * All protected by rbac middleware
 */
import express from 'express';
import {
  getCacheStats,
  clearCache,
  getCacheValue,
  setCacheValue,
  deleteCacheKey,
  checkCacheKey,
  warmupCache,
  getCacheMetrics,
} from '../../controllers/admin/adminCacheController.js';
import { rbacProtect, requirePermission, requireRole } from '../../middleware/rbac.js';

const router = express.Router();

// Apply RBAC protection to all routes
router.use(rbacProtect);

// Cache statistics and monitoring (Super Admin and Finance Admin)
router.get('/stats', requireRole(['super_admin', 'finance_admin']), getCacheStats);
router.get('/metrics', requireRole(['super_admin', 'finance_admin']), getCacheMetrics);

// Cache management (Super Admin only)
router.post('/clear', requireRole(['super_admin']), clearCache);
router.post('/warmup', requireRole(['super_admin']), warmupCache);

// Cache key operations (Super Admin only)
router.get('/:key', requireRole(['super_admin']), getCacheValue);
router.post('/:key', requireRole(['super_admin']), setCacheValue);
router.delete('/:key', requireRole(['super_admin']), deleteCacheKey);
router.head('/:key', requireRole(['super_admin']), checkCacheKey);

export default router;
