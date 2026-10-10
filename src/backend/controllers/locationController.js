import locationTrackingService from '../services/locationTrackingService.js';
import Order from '../models/Order.js';
import DeliveryBoy from '../models/DeliveryBoy.js';

class LocationController {
  // Update rider location
  async updateLocation(req, res) {
    try {
      const { orderId, riderId, location, batteryLevel, isMoving } = req.body;
      const userId = req.user.id;

      // Validate required fields
      if (!orderId || !riderId || !location) {
        return res.status(400).json({
          success: false,
          message: 'Order ID, rider ID, and location are required',
        });
      }

      // Validate location data
      if (!location.latitude || !location.longitude) {
        return res.status(400).json({
          success: false,
          message: 'Location must include latitude and longitude',
        });
      }

      // Verify the rider is updating their own location
      if (userId !== riderId) {
        return res.status(403).json({
          success: false,
          message: 'You can only update your own location',
        });
      }

      // Update location
      const result = await locationTrackingService.updateRiderLocation({
        orderId,
        riderId,
        location,
        batteryLevel,
        isMoving,
      });

      res.json({
        success: true,
        message: 'Location updated successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to update location',
        error: error.message,
      });
    }
  }

  // Get order tracking data
  async getOrderTracking(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      const trackingData = await locationTrackingService.getOrderTrackingData(orderId, userId);

      res.json({
        success: true,
        data: trackingData,
      });
    } catch (error) {      if (error.message === 'Order not found') {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      if (error.message === 'Access denied') {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to get tracking data',
        error: error.message,
      });
    }
  }

  // Start tracking for an order
  async startTracking(req, res) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      // Verify order exists and is in appropriate status
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      if (!['confirmed', 'preparing', 'ready', 'picked_up', 'on_the_way'].includes(order.status)) {
        return res.status(400).json({
          success: false,
          message: 'Order is not in a trackable status',
        });
      }

      const result = await locationTrackingService.startTracking(orderId);

      res.json({
        success: true,
        message: 'Tracking started successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to start tracking',
        error: error.message,
      });
    }
  }

  // Stop tracking for an order
  async stopTracking(req, res) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      const result = await locationTrackingService.stopTracking(orderId);

      res.json({
        success: true,
        message: 'Tracking stopped successfully',
        data: result,
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to stop tracking',
        error: error.message,
      });
    }
  }

  // Get rider's current location
  async getRiderLocation(req, res) {
    try {
      const { riderId } = req.params;

      if (!riderId) {
        return res.status(400).json({
          success: false,
          message: 'Rider ID is required',
        });
      }

      const rider = await DeliveryBoy.findById(riderId)
        .select('currentLocation lastLocationUpdate batteryLevel isMoving name phone vehicleNumber');

      if (!rider) {
        return res.status(404).json({
          success: false,
          message: 'Rider not found',
        });
      }

      let locationData = null;
      if (rider.currentLocation && rider.currentLocation.coordinates) {
        locationData = {
          latitude: rider.currentLocation.coordinates[1],
          longitude: rider.currentLocation.coordinates[0],
          lastUpdate: rider.lastLocationUpdate,
          batteryLevel: rider.batteryLevel,
          isMoving: rider.isMoving,
        };
      }

      res.json({
        success: true,
        data: {
          rider: {
            id: rider._id,
            name: rider.name,
            phone: rider.phone,
            vehicleNumber: rider.vehicleNumber,
          },
          location: locationData,
        },
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to get rider location',
        error: error.message,
      });
    }
  }

  // Get active tracking sessions (admin function)
  async getActiveTracking(req, res) {
    try {
      const activeTracking = locationTrackingService.getActiveTracking();

      res.json({
        success: true,
        data: {
          activeTracking,
          count: activeTracking.length,
        },
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to get active tracking',
        error: error.message,
      });
    }
  }

  // Get location history for an order
  async getLocationHistory(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message: 'Order ID is required',
        });
      }

      // Verify user has access to this order
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          success: false,
          message: 'Order not found',
        });
      }

      if (order.userId.toString() !== userId && order.vendorId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }

      const history = locationTrackingService.getLocationHistory(orderId);

      // Format history for response
      const formattedHistory = history.map(entry => ({
        latitude: entry.location.coordinates[1],
        longitude: entry.location.coordinates[0],
        timestamp: entry.timestamp,
        accuracy: entry.accuracy,
        heading: entry.heading,
        speed: entry.speed,
        batteryLevel: entry.batteryLevel,
        isMoving: entry.isMoving,
      }));

      res.json({
        success: true,
        data: {
          orderId,
          history: formattedHistory,
          count: formattedHistory.length,
        },
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to get location history',
        error: error.message,
      });
    }
  }

  // Calculate distance between two points
  async calculateDistance(req, res) {
    try {
      const { from, to } = req.body;

      if (!from || !to) {
        return res.status(400).json({
          success: false,
          message: 'From and to coordinates are required',
        });
      }

      if (!from.latitude || !from.longitude || !to.latitude || !to.longitude) {
        return res.status(400).json({
          success: false,
          message: 'Both coordinates must include latitude and longitude',
        });
      }

      const distance = locationTrackingService.calculateDistance(
        from.latitude,
        from.longitude,
        to.latitude,
        to.longitude
      );

      res.json({
        success: true,
        data: {
          distance: Math.round(distance), // Distance in meters
          distanceKm: Math.round(distance / 1000 * 100) / 100, // Distance in km
        },
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to calculate distance',
        error: error.message,
      });
    }
  }

  // Cleanup old tracking data (admin function)
  async cleanupTrackingData(req, res) {
    try {
      await locationTrackingService.cleanupOldTrackingData();

      res.json({
        success: true,
        message: 'Tracking data cleanup completed',
      });
    } catch (error) {      res.status(500).json({
        success: false,
        message: 'Failed to cleanup tracking data',
        error: error.message,
      });
    }
  }
}

export default new LocationController();
