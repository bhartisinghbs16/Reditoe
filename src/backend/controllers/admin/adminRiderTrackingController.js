/**
 * Admin Rider Tracking Controller
 * Provides real-time GPS tracking and location history for riders
 * Uses existing riderlocations collection and User model
 */

import mongoose from 'mongoose';
import User from '../../models/User.js';

/**
 * GET /admin/riders/tracking/live - Get live locations of all online riders
 */
export const getLiveRiderLocations = async (req, res) => {
  try {    // Get the riderlocations collection
    const RiderLocation = mongoose.connection.db.collection('riderlocations');
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000); // Last 5 minutes
    
    // First, let's just get any recent location data to test
    const recentLocations = await RiderLocation.find({
      timestamp: { $gte: fiveMinutesAgo }
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .toArray();    // If no recent locations, return empty response
    if (recentLocations.length === 0) {      return res.status(200).json({
        status: 'success',
        data: {
          riders: [],
          count: 0,
          lastUpdated: new Date(),
          message: 'No riders have sent location updates in the last 5 minutes'
        }
      });
    }
    
    // Get unique rider IDs from recent locations
    const uniqueRiderIds = [...new Set(recentLocations.map(loc => loc.riderId.toString()))];
    
    // Get rider details
    const riders = await User.find({ 
      _id: { $in: uniqueRiderIds },
      role: 'rider'
    }).select('_id name riderId vehicleName vehicleNumber currentRating isOnline kycStatus phone perKmCharge').lean();
    
    // Combine data - get latest location for each rider
    const liveLocations = uniqueRiderIds.map(riderId => {
      const rider = riders.find(r => r._id.toString() === riderId);
      if (!rider) return null;
      
      const latestLocation = recentLocations
        .filter(loc => loc.riderId.toString() === riderId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      
      if (!latestLocation) return null;
      
      return {
        riderId: rider._id,
        name: rider.name || 'Unknown Rider',
        riderIdNumber: rider.riderId || 'N/A',
        vehicleName: rider.vehicleName,
        vehicleNumber: rider.vehicleNumber,
        currentRating: rider.currentRating || 0,
        isOnline: rider.isOnline || false,
        kycStatus: rider.kycStatus || 'pending',
        coordinates: latestLocation.coordinates,
        timestamp: latestLocation.timestamp,
        accuracy: latestLocation.accuracy,
        speed: latestLocation.speed,
        heading: latestLocation.heading,
        phone: rider.phone,
        perKmCharge: rider.perKmCharge || 0
      };
    }).filter(Boolean);    res.status(200).json({
      status: 'success',
      data: {
        riders: liveLocations,
        count: liveLocations.length,
        lastUpdated: new Date()
      }
    });
    
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch live rider locations'
    });
  }
};

/**
 * GET /admin/riders/tracking/history/:riderId - Get location history for a specific rider
 */
export const getRiderLocationHistory = async (req, res) => {
  try {
    const { riderId } = req.params;
    const { hours = 24 } = req.query; // Default to last 24 hours
    
    if (!riderId || !mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid rider ID is required'
      });
    }    // Verify rider exists
    const rider = await User.findOne({ _id: riderId, role: 'rider' });
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found'
      });
    }
    
    const RiderLocation = mongoose.connection.db.collection('riderlocations');
    const hoursAgo = new Date(Date.now() - parseInt(hours) * 60 * 60 * 1000);
    
    const locationHistory = await RiderLocation.find({
      riderId: new mongoose.Types.ObjectId(riderId),
      timestamp: { $gte: hoursAgo }
    })
    .sort({ timestamp: -1 })
    .limit(500) // Limit to prevent too much data
    .toArray();    res.status(200).json({
      status: 'success',
      data: {
        rider: {
          id: rider._id,
          name: rider.name,
          riderId: rider.riderId,
          vehicleName: rider.vehicleName,
          isOnline: rider.isOnline
        },
        locationHistory,
        count: locationHistory.length,
        timeRange: {
          hours: parseInt(hours),
          from: hoursAgo,
          to: new Date()
        }
      }
    });
    
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch rider location history'
    });
  }
};

/**
 * GET /admin/riders/tracking/stats - Get rider tracking statistics
 */
export const getRiderTrackingStats = async (req, res) => {
  try {    const RiderLocation = mongoose.connection.db.collection('riderlocations');
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    // Get basic rider stats
    const totalRiders = await User.countDocuments({ role: 'rider' });
    const onlineRiders = await User.countDocuments({ role: 'rider', isOnline: true, isBlocked: false });
    const blockedRiders = await User.countDocuments({ role: 'rider', isBlocked: true });
    
    // Get location stats
    const recentLocations = await RiderLocation.countDocuments({
      timestamp: { $gte: oneHourAgo }
    });
    
    const todayLocations = await RiderLocation.countDocuments({
      timestamp: { $gte: twentyFourHoursAgo }
    });
    
    // Get active riders in last hour (riders with location updates)
    const activeRidersPipeline = [
      {
        $match: {
          timestamp: { $gte: oneHourAgo }
        }
      },
      {
        $group: {
          _id: '$riderId'
        }
      },
      {
        $count: 'activeRiders'
      }
    ];
    
    const activeRidersResult = await RiderLocation.aggregate(activeRidersPipeline);
    const activeRiders = activeRidersResult.length > 0 ? activeRidersResult[0].activeRiders : 0;
    
    // Get city-wise distribution
    const cityDistributionPipeline = [
      {
        $lookup: {
          from: 'users',
          localField: 'riderId',
          foreignField: '_id',
          as: 'rider'
        }
      },
      {
        $unwind: '$rider'
      },
      {
        $match: {
          'rider.role': 'rider',
          'rider.isOnline': true,
          timestamp: { $gte: oneHourAgo }
        }
      },
      {
        $addFields: {
          city: {
            $cond: {
              if: { $regexMatch: { input: '$rider.location', regex: /Delhi/i } },
              then: 'Delhi',
              else: {
                $cond: {
                  if: { $regexMatch: { input: '$rider.location', regex: /Mumbai/i } },
                  then: 'Mumbai',
                  else: {
                    $cond: {
                      if: { $regexMatch: { input: '$rider.location', regex: /Bangalore/i } },
                      then: 'Bangalore',
                      else: {
                        $cond: {
                          if: { $regexMatch: { input: '$rider.location', regex: /Hyderabad/i } },
                          then: 'Hyderabad',
                          else: {
                            $cond: {
                              if: { $regexMatch: { input: '$rider.location', regex: /Kolkata/i } },
                              then: 'Kolkata',
                              then: 'Others'
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      {
        $group: {
          _id: '$city',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ];
    
    const cityDistribution = await RiderLocation.aggregate(cityDistributionPipeline);    res.status(200).json({
      status: 'success',
      data: {
        riders: {
          total: totalRiders,
          online: onlineRiders,
          blocked: blockedRiders,
          active: activeRiders
        },
        locations: {
          recent: recentLocations,
          today: todayLocations
        },
        cityDistribution,
        lastUpdated: new Date()
      }
    });
    
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch rider tracking stats'
    });
  }
};

/**
 * GET /admin/riders/tracking/route/:riderId - Get current route/trajectory for a rider
 */
export const getRiderCurrentRoute = async (req, res) => {
  try {
    const { riderId } = req.params;
    const { minutes = 30 } = req.query; // Default to last 30 minutes
    
    if (!riderId || !mongoose.Types.ObjectId.isValid(riderId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid rider ID is required'
      });
    }    // Verify rider exists
    const rider = await User.findOne({ _id: riderId, role: 'rider' });
    if (!rider) {
      return res.status(404).json({
        status: 'error',
        message: 'Rider not found'
      });
    }
    
    const RiderLocation = mongoose.connection.db.collection('riderlocations');
    const minutesAgo = new Date(Date.now() - parseInt(minutes) * 60 * 1000);
    
    const routePoints = await RiderLocation.find({
      riderId: new mongoose.Types.ObjectId(riderId),
      timestamp: { $gte: minutesAgo }
    })
    .sort({ timestamp: 1 }) // Sort by timestamp ascending for route
    .limit(100) // Limit to prevent too much data
    .toArray();
    
    // Calculate route statistics
    let totalDistance = 0;
    let averageSpeed = 0;
    
    if (routePoints.length > 1) {
      for (let i = 1; i < routePoints.length; i++) {
        const prev = routePoints[i-1];
        const curr = routePoints[i];
        
        // Simple distance calculation (for demo purposes)
        const latDiff = curr.coordinates.latitude - prev.coordinates.latitude;
        const lngDiff = curr.coordinates.longitude - prev.coordinates.longitude;
        const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111; // Rough km conversion
        totalDistance += distance;
      }
      
      averageSpeed = routePoints.reduce((sum, point) => sum + (point.speed || 0), 0) / routePoints.length;
    }    res.status(200).json({
      status: 'success',
      data: {
        rider: {
          id: rider._id,
          name: rider.name,
          riderId: rider.riderId,
          vehicleName: rider.vehicleName,
          isOnline: rider.isOnline
        },
        route: routePoints,
        stats: {
          totalDistanceKm: Math.round(totalDistance * 100) / 100,
          averageSpeedKmh: Math.round(averageSpeed * 10) / 10,
          durationMinutes: parseInt(minutes),
          pointsCount: routePoints.length
        },
        timeRange: {
          minutes: parseInt(minutes),
          from: minutesAgo,
          to: new Date()
        }
      }
    });
    
  } catch (error) {    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch rider route'
    });
  }
};
