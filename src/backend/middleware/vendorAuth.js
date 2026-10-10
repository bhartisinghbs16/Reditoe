import Restaurant from '../models/Restaurant.js';

// Middleware to ensure user is a vendor and has a restaurant
export const vendorAuth = async (req, res, next) => {
  try {
    const userId = req.user?.id || req.user?._id;
    
    if (!userId) {
      console.error('❌ [vendorAuth] No user ID found');
      return res.status(401).json({
        status: 'error',
        message: 'User authentication required',
      });
    }

    // Check if user is a vendor
    if (req.user.role !== 'vendor') {
      console.error('❌ [vendorAuth] User is not a vendor:', req.user.role);
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Vendor role required.',
      });
    }

    // Find restaurant owned by this vendor
    const restaurant = await Restaurant.findOne({ owner: userId });

    if (!restaurant) {
      console.error('❌ [vendorAuth] Restaurant not found for vendor:', userId);
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found. Please complete your restaurant setup.',
      });
    }

    // Attach restaurant to request for use in controllers
    // Allow vendors with pending restaurants to access their dashboard
    // but they'll see limited functionality based on status
    req.restaurant = restaurant;
    req.restaurantId = restaurant._id;
    req.restaurantStatus = restaurant.status;
    req.isRestaurantEnabled = restaurant.isEnabled;
    
    next();
  } catch (error) {
    console.error('❌ [vendorAuth] Error in middleware:', error.message);
    if (process.env.NODE_ENV === 'development') {
      console.error('Stack:', error.stack);
    }
    res.status(500).json({
      status: 'error',
      message: 'Error verifying vendor access',
    });
  }
};
