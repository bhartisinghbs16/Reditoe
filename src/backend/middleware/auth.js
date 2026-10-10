import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// JWT_SECRET: utils/jwt.js logs once if missing; production exits there
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_SECRET_FINAL = JWT_SECRET || 'DEV-ONLY-INSECURE-SECRET-DO-NOT-USE-IN-PRODUCTION';

// Protect routes - verify JWT token
export const protect = async (req, res, next) => {
  try {
    let token;

    // Get token from headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'You are not logged in! Please log in to get access.',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET_FINAL);

    // Get user from token

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
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        status: 'error',
        message: 'The user belonging to this token does not exist.',
      });
    }

    // Grant access to protected route
    req.user = currentUser;
    next();
  } catch (error) {
    return res.status(401).json({
      status: 'error',
      message: 'Invalid token. Please log in again.',
    });
  }
};

// Restrict access to specific roles
export const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'You do not have permission to perform this action',
      });
    }
    next();
  };
};

// Admin authentication middleware
export const adminAuth = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      status: 'error',
      message: 'Admin access required',
    });
  }
  next();
};

// Vendor authentication middleware
export const vendorAuth = (req, res, next) => {
  if (req.user.role !== 'vendor') {
    return res.status(403).json({
      status: 'error',
      message: 'Vendor access required',
    });
  }
  next();
};

// Rider authentication middleware
export const riderAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      status: 'error',
      message: 'Authentication required',
    });
  }
  
  if (req.user.role !== 'rider') {
    return res.status(403).json({
      status: 'error',
      message: 'Rider role required',
    });
  }
  next();
};
