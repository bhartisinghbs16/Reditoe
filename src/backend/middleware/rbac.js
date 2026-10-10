/**
 * Role-Based Access Control (RBAC) Middleware
 * Additive only - works alongside existing adminAuth.js
 */
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Role from '../models/Role.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_FINAL = JWT_SECRET || 'DEV-ONLY-INSECURE-SECRET-DO-NOT-USE-IN-PRODUCTION';

/**
 * Enhanced admin protection with RBAC support
 * Maintains backward compatibility with existing adminAuth.js
 */
export const rbacProtect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Admin access requires login. Please log in to get access.',
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET_FINAL);
    const currentUser = await User.findById(decoded.id).populate({
      path: 'rbacRole',
      model: 'Role'
    });

    if (!currentUser) {
      return res.status(401).json({
        status: 'error',
        message: 'The user belonging to this token does not exist.',
      });
    }

    // Check if user has admin role (backward compatibility)
    if (currentUser.role === 'admin') {
      req.user = currentUser;
      req.userPermissions = ['*']; // Full access for legacy admins
      return next();
    }

    // Check if user has RBAC role
    if (currentUser.rbacRole && currentUser.rbacRole.name && typeof currentUser.rbacRole === 'object') {
      if (!currentUser.rbacRole.isActive) {
        return res.status(403).json({
          status: 'error',
          message: 'Your role has been deactivated. Please contact administrator.',
        });
      }

      req.user = currentUser;
      req.userRole = currentUser.rbacRole;
      
      // Flatten permissions for easier checking
      const permissions = [];
      currentUser.rbacRole.permissions.forEach(perm => {
        perm.actions.forEach(action => {
          permissions.push(`${perm.resource}:${action}`);
        });
      });
      req.userPermissions = permissions;
      
      return next();
    }

    return res.status(403).json({
      status: 'error',
      message: 'Access denied. Admin role required.',
    });
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid or expired token. Please log in again.',
    });
  }
};

/**
 * Permission-based access control middleware
 * Usage: router.get('/users', rbacProtect, requirePermission('users:read'))
 */
export const requirePermission = (permission) => {
  return (req, res, next) => {
    // Super admin bypass
    if (req.userPermissions && req.userPermissions.includes('*')) {
      return next();
    }

    // Check specific permission
    if (!req.userPermissions || !req.userPermissions.includes(permission)) {
      return res.status(403).json({
        status: 'error',
        message: `Access denied. Required permission: ${permission}`,
      });
    }

    next();
  };
};

/**
 * Role-based access control middleware
 * Usage: router.get('/users', rbacProtect, requireRole(['super_admin', 'finance_admin']))
 */
export const requireRole = (roles) => {
  return (req, res, next) => {
    // Legacy admin check
    if (req.user.role === 'admin') {
      return next();
    }

    // RBAC role check
    if (!req.userRole || !roles.includes(req.userRole.name)) {
      return res.status(403).json({
        status: 'error',
        message: `Access denied. Required role: ${roles.join(' or ')}`,
      });
    }

    next();
  };
};

/**
 * Organization-based access control middleware
 * Usage: router.get('/users', rbacProtect, requireOrganizationAccess)
 */
export const requireOrganizationAccess = async (req, res, next) => {
  try {
    // Super admin can access all organizations
    if (req.userPermissions && req.userPermissions.includes('*')) {
      return next();
    }

    // Check if user has organizationId
    if (!req.user.organizationId) {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. No organization assigned.',
      });
    }

    // Add organization filter to query
    if (req.query && !req.query.organizationId) {
      req.query.organizationId = req.user.organizationId;
    }

    next();
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Error checking organization access.',
    });
  }
};
