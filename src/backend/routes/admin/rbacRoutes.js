/**
 * RBAC Routes for Role-Based Access Control
 * Compatible with both legacy admin and RBAC authentication
 */
import express from 'express';
import {
  getRoles,
  createRole,
  updateRole,
  deleteRole,
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  getUserPermissions,
  getOrganizationsForDropdown,
} from '../../controllers/admin/adminRbacController.js';
import { adminProtect } from '../../middleware/adminAuth.js';
import { rbacProtect, requirePermission, requireRole } from '../../middleware/rbac.js';

const router = express.Router();

// Use adminProtect for legacy admin compatibility
// This allows existing admin users to access RBAC functionality
router.use(adminProtect);

// Role management routes - allow legacy admins full access
router.get('/roles', getRoles);
router.post('/roles', createRole);
router.put('/roles/:id', updateRole);
router.delete('/roles/:id', deleteRole);

// Admin user management routes
router.get('/users', getAdminUsers);
router.get('/organizations', getOrganizationsForDropdown);
router.post('/users', createAdminUser);
router.put('/users/:id', updateAdminUser);

// Current user permissions (for frontend access control)
router.get('/permissions', getUserPermissions);

export default router;
