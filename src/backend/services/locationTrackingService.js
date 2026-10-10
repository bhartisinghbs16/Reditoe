import Order from '../models/Order.js';
import riderBatchService from './riderBatchService.js';
import DeliveryBoy from '../models/DeliveryBoy.js';
import UserNotification from '../models/UserNotification.js';
import notificationService from './notificationService.js';

class LocationTrackingService {
  constructor() {
    this.activeTracking = new Map(); // orderId -> tracking data
    this.locationHistory = new Map(); // orderId -> array of locations
  }

  async updateRiderLocation(locationData) {
    try {
      const { orderId, riderId, location, batteryLevel, isMoving } = locationData;

      // Validate order and rider
      const order = await Order.findById(orderId).populate('restaurantId', 'address');
      if (!order) {
        throw new Error('Order not found');
      }

      if (order.assignedRider?.toString() !== riderId) {
        throw new Error('Rider not assigned to this order');
      }

      // Update rider's current location
      await DeliveryBoy.findByIdAndUpdate(riderId, {
        currentLocation: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude],
        },
        lastLocationUpdate: new Date(),
        batteryLevel,
        isMoving,
      });

      // Store location history for this order
      if (!this.locationHistory.has(orderId)) {
        this.locationHistory.set(orderId, []);
      }
      
      const historyEntry = {
        location: {
          type: 'Point',
          coordinates: [location.longitude, location.latitude],
        },
        timestamp: new Date(location.timestamp),
        accuracy: location.accuracy,
        heading: location.heading,
        speed: location.speed,
        batteryLevel,
        isMoving,
      };

      const history = this.locationHistory.get(orderId);
      history.push(historyEntry);

      // Keep only last 100 locations to prevent memory issues
      if (history.length > 100) {
        this.locationHistory.set(orderId, history.slice(-100));
      }

      // Update active tracking data
      this.activeTracking.set(orderId, {
        orderId,
        riderId,
        currentLocation: location,
        lastUpdate: new Date(),
        batteryLevel,
        isMoving,
      });

      // Check for significant location changes to trigger notifications
      await this.checkLocationTriggers(orderId, location, order);

      return {
        success: true,
        message: 'Location updated successfully',
      };
    } catch (error) {
      console.error('Error updating rider location:', error);
      throw error;
    }
  }

  async checkLocationTriggers(orderId, location, order) {
    try {
      const history = this.locationHistory.get(orderId) || [];
      if (history.length < 2) return; // Need at least 2 points to detect movement

      const previousLocation = history[history.length - 2];
      const currentLocation = history[history.length - 1];

      // Calculate distance from restaurant
      const restaurantCoords = order.restaurantId?.address?.coordinates;
      const distanceFromRestaurant = restaurantCoords ? this.calculateDistance(
        location.latitude,
        location.longitude,
        restaurantCoords.latitude,
        restaurantCoords.longitude
      ) : Infinity;

      // Calculate distance from delivery location
      const deliveryCoords = order.deliveryAddress?.coordinates;
      const distanceFromDelivery = deliveryCoords ? this.calculateDistance(
        location.latitude,
        location.longitude,
        deliveryCoords.latitude,
        deliveryCoords.longitude
      ) : Infinity;

      // Trigger notifications based on proximity
      if (order.status === 'confirmed' && distanceFromRestaurant < 100) {
        // Rider reached restaurant
        await this.handleRiderReachedRestaurant(orderId, order);
      } else if (order.status === 'picked_up' && distanceFromDelivery < 100) {
        // Rider reached delivery location
        await this.handleRiderReachedDelivery(orderId, order);
      }

      // Update ETA
      const eta = await this.calculateETA(orderId, location, deliveryCoords);
      await this.updateOrderETA(orderId, eta);
    } catch (error) {
      console.error('Error checking location triggers:', error);
    }
  }

  async handleRiderReachedRestaurant(orderId, order) {
    try {
      // Update order status if needed
      if (order.status === 'confirmed') {
        await Order.findByIdAndUpdate(orderId, {
          status: 'at_restaurant',
          'timestamps.atRestaurant': new Date(),
        });

        // Send notification to customer
        await notificationService.sendOrderNotification(orderId, 'rider_at_restaurant', {
          restaurantName: order.restaurantName,
        });
      }
    } catch (error) {
      console.error('Error handling rider reached restaurant:', error);
    }
  }

  async handleRiderReachedDelivery(orderId, order) {
    try {
      // Update order status if needed
      if (order.status === 'picked_up' || order.status === 'on_the_way') {
        await Order.findByIdAndUpdate(orderId, {
          status: 'at_delivery',
          'timestamps.atDelivery': new Date(),
        });

        // Send notification to customer
        await notificationService.sendOrderNotification(orderId, 'rider_at_delivery', {
          estimatedArrival: '2-3 minutes',
        });
      }
    } catch (error) {
      console.error('Error handling rider reached delivery:', error);
    }
  }

  async calculateETA(orderId, currentLocation, destinationCoords) {
    try {
      const distance = this.calculateDistance(
        currentLocation.latitude,
        currentLocation.longitude,
        destinationCoords[1],
        destinationCoords[0]
      );

      // Calculate ETA based on average speed (considering traffic)
      const averageSpeed = 25; // km/h in city traffic
      const etaMinutes = (distance / 1000) / averageSpeed * 60;

      // Add buffer for traffic conditions
      const bufferedETA = etaMinutes * 1.3;

      return Math.ceil(bufferedETA);
    } catch (error) {
      console.error('Error calculating ETA:', error);
      return 30; // Default 30 minutes
    }
  }

  async updateOrderETA(orderId, eta) {
    try {
      await Order.findByIdAndUpdate(orderId, {
        estimatedDeliveryTime: new Date(Date.now() + eta * 60 * 1000),
        eta: eta,
      });
    } catch (error) {
      console.error('Error updating order ETA:', error);
    }
  }

  async getOrderTrackingData(orderId, userId) {
    try {
      const order = await Order.findById(orderId)
        .populate('riderId', 'name phone photo vehicleNumber')
        .populate('userId', 'name')
        .populate('restaurantId', 'name address');

      if (!order) {
        throw new Error('Order not found');
      }

      // Verify user has access to this order
      if (order.userId._id.toString() !== userId && order.restaurantId._id.toString() !== userId) {
        throw new Error('Access denied');
      }

      // Get current tracking data
      const trackingData = this.activeTracking.get(orderId);
      const locationHistory = this.locationHistory.get(orderId) || [];

      // Build route coordinates from history
      const routeCoordinates = locationHistory.map(entry => ({
        latitude: entry.location.coordinates[1],
        longitude: entry.location.coordinates[0],
      }));

      // Build timeline
      const timeline = this.buildOrderTimeline(order);

      // Get rider info if assigned
      let riderInfo = null;
      if (order.riderId) {
        riderInfo = {
          id: order.riderId._id,
          name: order.riderId.name,
          phone: order.riderId.phone,
          photo: order.riderId.photo,
          vehicleNumber: order.riderId.vehicleNumber,
        };
      }

      /**
       * Where this delivery sits in the rider's run, when they are carrying
       * more than one. Null when there is no queue to describe.
       */
      const batch = await riderBatchService.batchViewFor(order);

      return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        batch,
        riderLocation: trackingData?.currentLocation,
        restaurantLocation: {
          latitude: order.restaurantId?.address?.coordinates?.latitude || 0,
          longitude: order.restaurantId?.address?.coordinates?.longitude || 0,
        },
        deliveryLocation: {
          latitude: order.deliveryAddress?.coordinates?.latitude || 0,
          longitude: order.deliveryAddress?.coordinates?.longitude || 0,
        },
        routeCoordinates,
        estimatedTime: order.eta,
        riderInfo,
        timeline,
        lastUpdate: trackingData?.lastUpdate,
      };
    } catch (error) {
      console.error('Error getting order tracking data:', error);
      throw error;
    }
  }

  buildOrderTimeline(order) {
    const timeline = [];
    const timestamps = order.timestamps || {};

    // Add timeline entries based on order status and timestamps
    if (timestamps.placed) {
      timeline.push({
        status: 'Order Placed',
        timestamp: timestamps.placed,
        description: `Order #${order.orderNumber} has been placed successfully`,
      });
    }

    if (timestamps.confirmed) {
      timeline.push({
        status: 'Order Confirmed',
        timestamp: timestamps.confirmed,
        description: 'Restaurant has confirmed your order',
      });
    }

    if (timestamps.preparing) {
      timeline.push({
        status: 'Preparing',
        timestamp: timestamps.preparing,
        description: 'Restaurant is preparing your food',
      });
    }

    if (timestamps.ready) {
      timeline.push({
        status: 'Ready for Pickup',
        timestamp: timestamps.ready,
        description: 'Your order is ready and waiting for rider',
      });
    }

    if (timestamps.atRestaurant) {
      timeline.push({
        status: 'Rider at Restaurant',
        timestamp: timestamps.atRestaurant,
        description: 'Delivery partner has arrived at restaurant',
      });
    }

    if (timestamps.pickedUp) {
      timeline.push({
        status: 'Order Picked Up',
        timestamp: timestamps.pickedUp,
        description: 'Rider has picked up your order',
      });
    }

    if (timestamps.onTheWay) {
      timeline.push({
        status: 'On the Way',
        timestamp: timestamps.onTheWay,
        description: 'Your order is on the way to your location',
      });
    }

    if (timestamps.atDelivery) {
      timeline.push({
        status: 'Arriving Soon',
        timestamp: timestamps.atDelivery,
        description: 'Rider is at your location',
      });
    }

    if (timestamps.delivered) {
      timeline.push({
        status: 'Delivered',
        timestamp: timestamps.delivered,
        description: 'Order has been delivered successfully',
      });
    }

    return timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // Distance in meters
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  async startTracking(orderId) {
    try {
      const order = await Order.findById(orderId);
      if (!order) {
        throw new Error('Order not found');
      }

      // Initialize tracking data
      this.activeTracking.set(orderId, {
        orderId,
        riderId: order.assignedRider,
        startTime: new Date(),
      });

      // Initialize location history
      this.locationHistory.set(orderId, []);

      console.log(`Started tracking for order ${orderId}`);
      return { success: true };
    } catch (error) {
      console.error('Error starting tracking:', error);
      throw error;
    }
  }

  async stopTracking(orderId) {
    try {
      // Remove from active tracking
      this.activeTracking.delete(orderId);

      // Keep location history for a while for analytics, then clean up
      setTimeout(() => {
        this.locationHistory.delete(orderId);
      }, 24 * 60 * 60 * 1000); // 24 hours

      console.log(`Stopped tracking for order ${orderId}`);
      return { success: true };
    } catch (error) {
      console.error('Error stopping tracking:', error);
      throw error;
    }
  }

  getActiveTracking() {
    return Array.from(this.activeTracking.values());
  }

  getLocationHistory(orderId) {
    return this.locationHistory.get(orderId) || [];
  }

  async cleanupOldTrackingData() {
    try {
      // Clean up location history for orders older than 24 hours
      const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      for (const [orderId, history] of this.locationHistory.entries()) {
        const oldestEntry = history[0];
        if (oldestEntry && new Date(oldestEntry.timestamp) < cutoffTime) {
          this.locationHistory.delete(orderId);
          console.log(`Cleaned up tracking data for order ${orderId}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up tracking data:', error);
    }
  }
}

export default new LocationTrackingService();
