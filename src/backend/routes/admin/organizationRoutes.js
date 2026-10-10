/**
 * Organization Routes for Multi-Tenant Support
 * All protected by rbac middleware
 */
import express from 'express';
import {
  getOrganizations,
  createOrganization,
  updateOrganization,
  deleteOrganization,
  getOrganizationStats,
  getCurrentOrganization,
  switchOrganization,
  getOrganizationUsers,
} from '../../controllers/admin/adminOrganizationController.js';
import { rbacProtect, requirePermission, requireRole } from '../../middleware/rbac.js';

const router = express.Router();

// Apply RBAC protection to all routes
router.use(rbacProtect);

// Organization management (Super Admin only)
router.get('/', requireRole(['super_admin']), getOrganizations);
router.post('/', requireRole(['super_admin']), createOrganization);
router.put('/:id', requireRole(['super_admin']), updateOrganization);
router.delete('/:id', requireRole(['super_admin']), deleteOrganization);

// Organization statistics (Super Admin and Finance Admin)
router.get('/:id/stats', requireRole(['super_admin', 'finance_admin']), getOrganizationStats);

// Current organization context (all authenticated admin users)
router.get('/current', getCurrentOrganization);

// Switch organization (Super Admin only)
router.post('/switch', requireRole(['super_admin']), switchOrganization);

// Organization users (Super Admin and Finance Admin)
router.get('/:id/users', requireRole(['super_admin', 'finance_admin']), getOrganizationUsers);

export default router;
