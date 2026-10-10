/**
 * Enhanced Admin Authentication Middleware
 * Supports both legacy admin users and RBAC users
 * Handles authentication, role verification, and permission setting
 */

import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_FINAL = JWT_SECRET || 'DEV-ONLY-INSECURE-SECRET-DO-NOT-USE-IN-PRODUCTION';

/**
 * Enhanced admin protection with RBAC support
 * Works with both legacy admin (role: 'admin') and RBAC users (role object)
 */
export const adminProtect = async (req, res, next) => {
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

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET_FINAL);
    } catch (jwtError) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[AUTH] JWT verification failed:', jwtError.message);
      }
      return res.status(401).json({
        status: 'error',
        message: 'Invalid or expired token. Please log in again.',
      });
    }


    /**
     * A half-finished sign-in is not a session.
     *
     * The token handed out after the password step carries `use:
     * '2fa-challenge'` and is only good for exchanging for a real session at
     * /2fa/verify. Without this check it verifies like any other token and
     * opens the console on the password alone, which is the exact thing the
     * second step exists to prevent.
     */
    if (decoded?.use === '2fa-challenge') {
      return res.status(401).json({
        status: 'error',
        message: 'Finish signing in with your authenticator code.',
      });
    }
    const currentUser = await User.findById(decoded.id).populate('rbacRole');
    if (!currentUser) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[AUTH] User not found for ID:', decoded.id);
      }
      return res.status(401).json({
        status: 'error',
        message: 'The user belonging to this token does not exist.',
      });
    }

    req.user = currentUser;

    if (currentUser.rbacRole && currentUser.rbacRole.permissions) {
      const userPermissions = [];
      currentUser.rbacRole.permissions.forEach(perm => {
        perm.actions.forEach(action => {
          userPermissions.push(`${perm.resource}:${action}`);
        });
      });
      req.userPermissions = userPermissions;
      req.userRole = currentUser.rbacRole;
    } else if (currentUser.role === 'admin') {
      req.userPermissions = ['*'];
      req.userRole = { name: 'admin', displayName: 'Administrator', level: 1 };
    } else {
      return res.status(403).json({
        status: 'error',
        message: 'Invalid user role. Please contact administrator.',
      });
    }

    next();
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[AUTH] Unexpected error:', error.message);
    }
    return res.status(401).json({
      status: 'error',
      message: 'Authentication error. Please try again.',
    });
  }
};
