import Order from '../models/Order.js';
import User from '../models/User.js';
import websocketService from './websocketService.js';

class LiveTrackingService {
  constructor() {
    this.activeTrackings = new Map(); // orderId -> tracking data
    this.riderLocations = new Map(); // riderId -> location data
    this.locationUpdateInterval = null;
  }

  initialize() {
    // Start periodic location updates
    this.startLocationUpdates();
    console.log('📍 Live tracking service initialized');
  }

  // Start tracking an order
  startTracking(orderId, userId) {
    const tracking = {
      orderId,
      userId,
      startTime: new Date(),
      lastUpdate: new Date(),
      isActive: true
    };

    this.activeTrackings.set(orderId, tracking);


    console.log(`📍 Started tracking order ${orderId} for user ${userId}`);
    return tracking;
  }

  // Stop tracking an order
  stopTracking(orderId) {
    const tracking = this.activeTrackings.get(orderId);
    if (tracking) {
      tracking.isActive = false;
      this.activeTrackings.delete(orderId);

      const io = websocketService.getIO();
      if (io) {
        io.to(`tracking:${orderId}`).emit('tracking:ended', { orderId });
        io.in(`tracking:${orderId}`).socketsLeave(`tracking:${orderId}`);
      }

      console.log(`📍 Stopped tracking order ${orderId}`);
    }
  }

  // Update rider location
  updateRiderLocation(riderId, location, orderId) {
    const locationData = {
      riderId,
      orderId,
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: new Date(),
      accuracy: location.accuracy || null,
      heading: location.heading || null,
      speed: location.speed || null
    };

    this.riderLocations.set(riderId, locationData);

    // Emit real-time location update to tracking users
    const io = websocketService.getIO();
    if (io) {
      io.to(`tracking:${orderId}`).emit('rider:location', locationData);
    }

    // Throttled database update (every 30 seconds)
    this.throttledLocationUpdate(locationData);

    console.log(`📍 Rider ${riderId} location updated for order ${orderId}`);
  }

  // Calculate ETA using Haversine formula
  calculateETA(riderLocation, deliveryLocation, averageSpeed = 30) {
    if (!riderLocation || !deliveryLocation) return null;

    const distance = this.calculateDistance(
      riderLocation.latitude,
      riderLocation.longitude,
      deliveryLocation.latitude,
      deliveryLocation.longitude
    );

    // Average speed in km/h, convert to minutes
    const etaMinutes = (distance / averageSpeed) * 60;
    const eta = new Date(Date.now() + etaMinutes * 60 * 1000);

    return {
      distance: Math.round(distance * 100) / 100, // Round to 2 decimal places
      etaMinutes: Math.round(etaMinutes),
      etaTime: eta.toISOString(),
      confidence: this.calculateETAConfidence(riderLocation, deliveryLocation)
    };
  }

  // Calculate distance between two points using Haversine formula
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  // Calculate ETA confidence based on data quality
  calculateETAConfidence(riderLocation, deliveryLocation) {
    if (!riderLocation.accuracy) return 'medium';
    
    const distance = this.calculateDistance(
      riderLocation.latitude,
      riderLocation.longitude,
      deliveryLocation.latitude,
      deliveryLocation.longitude
    );

    if (riderLocation.accuracy < 10 && distance < 1) return 'high';
    if (riderLocation.accuracy < 50) return 'medium';
    return 'low';
  }

  // Get order tracking status
  async getOrderTrackingStatus(orderId, userId) {
    try {
      const order = await Order.findById(orderId)
        .populate('riderId', 'name email phone')
        .populate('restaurantId', 'name address coordinates');

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.userId.toString() !== userId.toString()) {
        throw new Error('Unauthorized');
      }

      const tracking = this.activeTrackings.get(orderId);
      const riderLocation = order.riderId ? this.riderLocations.get(order.riderId._id) : null;

      let eta = null;
      if (riderLocation && order.deliveryAddress?.coordinates) {
        eta = this.calculateETA(
          riderLocation,
          order.deliveryAddress.coordinates
        );
      }

      return {
        orderId,
        status: order.status,
        trackingActive: !!tracking,
        rider: order.riderId ? {
          id: order.riderId._id,
          name: order.riderId.name,
          phone: order.riderId.phone
        } : null,
        restaurant: {
          id: order.restaurantId._id,
          name: order.restaurantId.name,
          address: order.restaurantId.address,
          coordinates: order.restaurantId.address?.coordinates
        },
        deliveryAddress: order.deliveryAddress,
        riderLocation,
        eta,
        timeline: order.timeline,
        lastUpdate: tracking?.lastUpdate || null
      };
    } catch (error) {
      console.error('Error getting order tracking status:', error);
      throw error;
    }
  }

  // Throttled database update for rider locations
  throttledLocationUpdate(locationData) {
    const riderId = locationData.riderId;
    const lastUpdate = this.riderLocations.get(`${riderId}:lastDBUpdate`);
    
    if (!lastUpdate || Date.now() - lastUpdate > 30000) { // 30 seconds
      this.riderLocations.set(`${riderId}:lastDBUpdate`, Date.now());
      
      // Update database asynchronously
      this.updateRiderLocationInDB(locationData).catch(err => {
        console.error('Failed to update rider location in DB:', err);
      });
    }
  }

  // Update rider location in database
  async updateRiderLocationInDB(locationData) {
    try {
      await User.findByIdAndUpdate(locationData.riderId, {
        $set: {
          'liveLocation': {
            latitude: locationData.latitude,
            longitude: locationData.longitude,
            timestamp: locationData.timestamp,
            accuracy: locationData.accuracy,
            heading: locationData.heading,
            speed: locationData.speed
          }
        }
      });
    } catch (error) {
      console.error('Database location update failed:', error);
    }
  }

  // Start periodic location updates
  startLocationUpdates() {
    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
    }

    this.locationUpdateInterval = setInterval(async () => {
      await this.processActiveOrders();
    }, 15000); // Every 15 seconds
  }

  // Process active orders and emit updates
  async processActiveOrders() {
    try {
      const activeOrders = await Order.find({
        status: { $in: ['Processing', 'Ready', 'OnWay'] },
        riderId: { $ne: null }
      }).populate('riderId', 'name liveLocation');

      for (const order of activeOrders) {
        const riderLocation = order.riderId ? this.riderLocations.get(order.riderId._id) : null;
        
        if (riderLocation && order.deliveryAddress?.coordinates) {
          const eta = this.calculateETA(
            riderLocation,
            order.deliveryAddress.coordinates
          );

          // Emit ETA update to tracking users
          const io = websocketService.getIO();
          if (io) {
            io.to(`tracking:${order._id}`).emit('order:eta', {
              orderId: order._id,
              eta,
              riderLocation,
              status: order.status
            });
          }
        }
      }
    } catch (error) {
      console.error('Error processing active orders:', error);
    }
  }

  // Get rider location history
  async getRiderLocationHistory(riderId, startTime, endTime) {
    try {
      const rider = await User.findById(riderId).select('liveLocation');
      
      if (!rider) {
        throw new Error('Rider not found');
      }

      // This would typically query a location history collection
      // For now, return current location
      const currentLocation = this.riderLocations.get(riderId);
      
      return {
        riderId,
        history: currentLocation ? [currentLocation] : [],
        summary: {
          totalDistance: 0,
          averageSpeed: 0,
          activeTime: 0
        }
      };
    } catch (error) {
      console.error('Error getting rider location history:', error);
      throw error;
    }
  }

  // Clean up inactive trackings
  cleanup() {
    const now = Date.now();
    
    for (const [orderId, tracking] of this.activeTrackings.entries()) {
      // Remove trackings inactive for more than 2 hours
      if (now - tracking.lastUpdate.getTime() > 2 * 60 * 60 * 1000) {
        this.stopTracking(orderId);
      }
    }

    // Clean up old rider locations (older than 1 hour)
    for (const [riderId, location] of this.riderLocations.entries()) {
      if (now - location.timestamp.getTime() > 60 * 60 * 1000) {
        this.riderLocations.delete(riderId);
      }
    }
  }

  // Get service statistics
  getStats() {
    return {
      activeTrackings: this.activeTrackings.size,
      riderLocations: this.riderLocations.size,
      uptime: process.uptime()
    };
  }

  // Graceful shutdown
  shutdown() {
    if (this.locationUpdateInterval) {
      clearInterval(this.locationUpdateInterval);
    }

    // Stop all active trackings
    for (const orderId of this.activeTrackings.keys()) {
      this.stopTracking(orderId);
    }

    console.log('📍 Live tracking service shut down');
  }
}

// Singleton instance
const liveTrackingService = new LiveTrackingService();

export default liveTrackingService;
