import User from '../models/User.js';
import Restaurant from '../models/Restaurant.js';

/**
 * Middleware to verify user is authenticated and has 'rider' role
 * Attaches rider info to req.rider and req.riderId
 */
export const riderAuth = async (req, res, next) => {
  try {
    // Check if user is authenticated (from protect middleware)
    if (!req.user) {
      console.error('❌ [riderAuth] No user found in request');
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    // Check if user has 'rider' role
    if (req.user.role !== 'rider') {
      console.error('❌ [riderAuth] User role is not rider:', req.user.role);
      return res.status(403).json({
        status: 'error',
        message: 'Rider role required',
      });
    }

    // Attach rider info to request
    req.rider = req.user;
    req.riderId = req.user._id.toString();
    
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ [riderAuth] Authentication successful. Rider ID:', req.riderId);
    }

    next();
  } catch (error) {
    console.error('❌ [riderAuth] Error in middleware:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack:', error.stack);
    }
    res.status(500).json({
      status: 'error',
      message: 'Authentication error',
    });
  }
};
