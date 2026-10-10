/**
 * Vendor Visibility Middleware
 * Ensures consistent vendor visibility logic between frontend and backend
 * Validates restaurant state before allowing operations
 */

import Restaurant from '../models/Restaurant.js';

class VendorVisibilityMiddleware {
  /**
   * Middleware to validate restaurant visibility before operations
   */
  static validateRestaurantVisibility() {
    return async (req, res, next) => {
      try {
        const restaurantId = req.params.restaurantId || req.params.id || req.body.restaurantId;
        
        if (!restaurantId) {
          return res.status(400).json({
            success: false,
            message: 'Restaurant ID is required',
          });
        }

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
          return res.status(404).json({
            success: false,
            message: 'Restaurant not found',
          });
        }

        // Check if restaurant is visible and enabled
        if (!this.isRestaurantVisible(restaurant)) {
          return res.status(403).json({
            success: false,
            message: 'Restaurant is not visible or enabled',
            details: {
              status: restaurant.status,
              isEnabled: restaurant.isEnabled,
              reason: this.getVisibilityReason(restaurant),
            },
          });
        }

        // Attach restaurant to request for downstream use
        req.restaurant = restaurant;
        next();
      } catch (error) {
        console.error('Error in vendor visibility middleware:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    };
  }

  /**
   * Middleware to ensure vendor can only access their own restaurants
   */
  static validateVendorOwnership() {
    return async (req, res, next) => {
      try {
        const userId = req.user.id;
        const restaurantId = req.params.restaurantId || req.params.id || req.body.restaurantId;
        
        if (!restaurantId) {
          return res.status(400).json({
            success: false,
            message: 'Restaurant ID is required',
          });
        }

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
          return res.status(404).json({
            success: false,
            message: 'Restaurant not found',
          });
        }

        // Check if user owns this restaurant
        if (restaurant.owner.toString() !== userId) {
          return res.status(403).json({
            success: false,
            message: 'Access denied - you do not own this restaurant',
          });
        }

        // Attach restaurant to request for downstream use
        req.restaurant = restaurant;
        next();
      } catch (error) {
        console.error('Error in vendor ownership middleware:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    };
  }

  /**
   * Check if restaurant is visible based on unified logic
   */
  static isRestaurantVisible(restaurant) {
    // Unified visibility logic: restaurant must be approved AND enabled
    // This aligns frontend (isEnabled) and backend (status) logic
    return restaurant.status === 'approved' && restaurant.isEnabled === true;
  }

  /**
   * Get reason why restaurant is not visible
   */
  static getVisibilityReason(restaurant) {
    if (restaurant.status !== 'approved') {
      return `Restaurant status is '${restaurant.status}'. Must be 'approved'.`;
    }
    
    if (!restaurant.isEnabled) {
      return 'Restaurant is disabled. Must be enabled.';
    }
    
    return 'Unknown visibility issue.';
  }

  /**
   * Filter restaurants based on visibility
   */
  static filterVisibleRestaurants(restaurants) {
    return restaurants.filter(restaurant => this.isRestaurantVisible(restaurant));
  }

  /**
   * Add visibility status to restaurant objects
   */
  static addVisibilityStatus(restaurants) {
    return restaurants.map(restaurant => ({
      ...restaurant.toObject(),
      isVisible: this.isRestaurantVisible(restaurant),
      visibilityReason: this.isRestaurantVisible(restaurant) ? null : this.getVisibilityReason(restaurant),
    }));
  }

  /**
   * Middleware to auto-correct inconsistent restaurant states
   */
  static autoCorrectRestaurantState() {
    return async (req, res, next) => {
      try {
        const restaurantId = req.params.restaurantId || req.params.id || req.body.restaurantId;
        
        if (!restaurantId) {
          return next();
        }

        const restaurant = await Restaurant.findById(restaurantId);
        if (!restaurant) {
          return next();
        }

        let needsUpdate = false;
        const updates = {};

        // Auto-correct inconsistent states
        if (restaurant.status === 'approved' && !restaurant.isEnabled) {
          updates.isEnabled = true;
          needsUpdate = true;
          console.log(`🔧 [Visibility] Auto-correcting restaurant ${restaurant.name}: enabling approved restaurant`);
        }

        if (restaurant.status !== 'approved' && restaurant.isEnabled) {
          updates.isEnabled = false;
          needsUpdate = true;
          console.log(`🔧 [Visibility] Auto-correcting restaurant ${restaurant.name}: disabling non-approved restaurant`);
        }

        if (needsUpdate) {
          await Restaurant.findByIdAndUpdate(restaurantId, updates, {
            new: true,
            runValidators: true,
          });
          
          console.log(`✅ [Visibility] Auto-corrected restaurant state for ${restaurant.name}`);
        }

        next();
      } catch (error) {
        console.error('Error in auto-correction middleware:', error);
        next(); // Continue even if auto-correction fails
      }
    };
  }

  /**
   * Get visibility statistics
   */
  static async getVisibilityStats() {
    try {
      const stats = await Restaurant.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            approved: {
              $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
            },
            enabled: {
              $sum: { $cond: ['$isEnabled', 1, 0] }
            },
            visible: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ['$status', 'approved'] }, '$isEnabled'] },
                  1,
                  0
                ]
              }
            },
            inconsistent: {
              $sum: {
                $cond: [
                  {
                    $or: [
                      { $and: [{ $eq: ['$status', 'approved'] }, { $not: '$isEnabled' }] },
                      { $and: [{ $ne: ['$status', 'approved'] }, '$isEnabled'] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
          }
        }
      ]);

      const result = stats[0] || {
        total: 0,
        approved: 0,
        enabled: 0,
        visible: 0,
        inconsistent: 0,
      };

      return {
        ...result,
        visibilityRate: result.total > 0 ? (result.visible / result.total) * 100 : 0,
        inconsistencyRate: result.total > 0 ? (result.inconsistent / result.total) * 100 : 0,
      };
    } catch (error) {
      console.error('Error getting visibility stats:', error);
      return {
        total: 0,
        approved: 0,
        enabled: 0,
        visible: 0,
        inconsistent: 0,
        visibilityRate: 0,
        inconsistencyRate: 0,
      };
    }
  }

  /**
   * Bulk fix inconsistent restaurant states
   */
  static async bulkFixInconsistentStates() {
    try {
      console.log('🔧 [Visibility] Starting bulk fix of inconsistent restaurant states');

      // Fix approved but disabled restaurants
      const approvedDisabled = await Restaurant.updateMany(
        { status: 'approved', isEnabled: false },
        { isEnabled: true }
      );

      // Fix not approved but enabled restaurants
      const notApprovedEnabled = await Restaurant.updateMany(
        { status: { $ne: 'approved' }, isEnabled: true },
        { isEnabled: false }
      );

      console.log(`✅ [Visibility] Fixed ${approvedDisabled.modifiedCount} approved-but-disabled restaurants`);
      console.log(`✅ [Visibility] Fixed ${notApprovedEnabled.modifiedCount} not-approved-but-enabled restaurants`);

      return {
        approvedDisabledFixed: approvedDisabled.modifiedCount,
        notApprovedEnabledFixed: notApprovedEnabled.modifiedCount,
        totalFixed: approvedDisabled.modifiedCount + notApprovedEnabled.modifiedCount,
      };
    } catch (error) {
      console.error('Error in bulk fix:', error);
      throw error;
    }
  }

  /**
   * Validate restaurant before listing
   */
  static validateForListing(restaurant) {
    const isVisible = this.isRestaurantVisible(restaurant);
    
    return {
      ...restaurant.toObject(),
      isVisible,
      visibilityReason: isVisible ? null : this.getVisibilityReason(restaurant),
    };
  }

  /**
   * Create restaurant with proper initial state
   */
  static createRestaurantWithProperState(restaurantData) {
    // Ensure initial state is consistent
    const initialStatus = restaurantData.status || 'pending';
    const initialEnabled = initialStatus === 'approved';

    return {
      ...restaurantData,
      status: initialStatus,
      isEnabled: initialEnabled,
    };
  }
}

export default VendorVisibilityMiddleware;
