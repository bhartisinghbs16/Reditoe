import Order from '../models/Order.js';
import User from '../models/User.js';
import liveTrackingService from '../services/liveTrackingService.js';
import websocketService from '../services/websocketService.js';

class LiveTrackingController {
  // Start tracking an order (customer)
  async startTracking(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      // Verify order exists and belongs to user
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      if (order.userId.toString() !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'Unauthorized - You can only track your own orders'
        });
      }

      // Check if order is in a trackable state
      const trackableStatuses = ['Order Confirmed', 'Processing', 'Ready', 'OnWay'];
      if (!trackableStatuses.includes(order.status)) {
        return res.status(400).json({
          status: 'error',
          message: 'Order is not in a trackable state',
          orderStatus: order.status
        });
      }

      // Start tracking
      const tracking = liveTrackingService.startTracking(orderId, userId);

      res.json({
        status: 'success',
        message: 'Tracking started successfully',
        data: {
          orderId,
          trackingActive: true,
          startTime: tracking.startTime,
          orderStatus: order.status
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to start tracking'
      });
    }
  }

  // Stop tracking an order (customer)
  async stopTracking(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      // Verify order belongs to user
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      if (order.userId.toString() !== userId) {
        return res.status(403).json({
          status: 'error',
          message: 'Unauthorized'
        });
      }

      // Stop tracking
      liveTrackingService.stopTracking(orderId);

      res.json({
        status: 'success',
        message: 'Tracking stopped successfully',
        data: {
          orderId,
          trackingActive: false
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to stop tracking'
      });
    }
  }

  // Get tracking status (customer)
  async getTrackingStatus(req, res) {
    try {
      const { orderId } = req.params;
      const userId = req.user.id;

      const status = await liveTrackingService.getOrderTrackingStatus(orderId, userId);

      res.json({
        status: 'success',
        data: status
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: error.message || 'Failed to get tracking status'
      });
    }
  }

  // Update rider location (rider)
  async updateRiderLocation(req, res) {
    try {
      const { orderId } = req.params;
      const riderId = req.user.id;
      const { latitude, longitude, accuracy, heading, speed } = req.body;

      // Validate coordinates
      if (!latitude || !longitude || 
          typeof latitude !== 'number' || typeof longitude !== 'number' ||
          latitude < -90 || latitude > 90 || 
          longitude < -180 || longitude > 180) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid coordinates'
        });
      }

      // Verify rider is assigned to this order
      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      if (order.riderId?.toString() !== riderId) {
        return res.status(403).json({
          status: 'error',
          message: 'Unauthorized - You are not assigned to this order'
        });
      }

      // Update location
      liveTrackingService.updateRiderLocation(riderId, {
        latitude,
        longitude,
        accuracy,
        heading,
        speed
      }, orderId);

      res.json({
        status: 'success',
        message: 'Location updated successfully',
        data: {
          orderId,
          latitude,
          longitude,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to update location'
      });
    }
  }

  // Get rider's active orders (rider)
  async getRiderActiveOrders(req, res) {
    try {
      const riderId = req.user.id;

      const activeOrders = await Order.find({
        riderId,
        status: { $in: ['Processing', 'Ready', 'OnWay'] }
      })
      .populate('restaurantId', 'name address coordinates')
      .populate('userId', 'name')
      .select('_id status deliveryAddress restaurantId userId createdAt total');

      res.json({
        status: 'success',
        data: activeOrders
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get active orders'
      });
    }
  }

  // Get rider location history (admin)
  async getRiderLocationHistory(req, res) {
    try {
      const { riderId } = req.params;
      const { startTime, endTime } = req.query;

      // Only admins can access location history
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Admin access required'
        });
      }

      const history = await liveTrackingService.getRiderLocationHistory(
        riderId,
        startTime ? new Date(startTime) : new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        endTime ? new Date(endTime) : new Date()
      );

      res.json({
        status: 'success',
        data: history
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get location history'
      });
    }
  }

  // Get tracking statistics (admin)
  async getTrackingStats(req, res) {
    try {
      // Only admins can access stats
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Admin access required'
        });
      }

      const stats = liveTrackingService.getStats();
      const wsStats = websocketService.getConnectionStats();

      res.json({
        status: 'success',
        data: {
          ...stats,
          websocket: wsStats
        }
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get tracking statistics'
      });
    }
  }

  // Get all active trackings (admin)
  async getActiveTrackings(req, res) {
    try {
      // Only admins can access active trackings
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Admin access required'
        });
      }

      const activeTrackings = [];
      
      // Get all active tracking orders
      for (const [orderId, tracking] of liveTrackingService.activeTrackings.entries()) {
        if (tracking.isActive) {
          try {
            const order = await Order.findById(orderId)
              .populate('userId', 'name email')
              .populate('riderId', 'name email')
              .populate('restaurantId', 'name');
            
            if (order) {
              activeTrackings.push({
                orderId,
                order,
                tracking,
                riderLocation: liveTrackingService.riderLocations.get(order.riderId?._id)
              });
            }
          } catch (error) {          }
        }
      }

      res.json({
        status: 'success',
        data: activeTrackings
      });
    } catch (error) {      res.status(500).json({
        status: 'error',
        message: 'Failed to get active trackings'
      });
    }
  }
}

export default new LiveTrackingController();
