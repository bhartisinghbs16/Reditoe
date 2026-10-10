import express from 'express';
import axios from 'axios';
import mongoose from 'mongoose';

const router = express.Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

router.post('/location', async (req, res) => {
  try {
    const { lat, lng, timestamp, riderId, orderId } = req.body;

    if (!lat || !lng || !timestamp) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: lat, lng, timestamp'
      });
    }

    if (typeof lat !== 'number' || typeof lng !== 'number' ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates'
      });
    }

    const userId = req.user?.id || riderId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID or rider ID is required'
      });
    }

    const RiderLocation = mongoose.connection.db.collection('riderlocations');
    const locationData = {
      riderId: new mongoose.Types.ObjectId(userId),
      orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
      coordinates: {
        latitude: lat,
        longitude: lng
      },
      timestamp: new Date(timestamp),
      accuracy: req.body.accuracy || null,
      speed: req.body.speed || null,
      heading: req.body.heading || null,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      createdAt: new Date()
    };

    await RiderLocation.insertOne(locationData);

    res.json({
      success: true,
      message: 'Location updated successfully',
      data: {
        lat,
        lng,
        timestamp,
        riderId: userId,
        orderId,
        receivedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.get('/location/history', async (req, res) => {
  try {
    const { riderId, limit = 10, offset = 0 } = req.query;
    const userId = req.user?.id || riderId;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID or rider ID is required'
      });
    }

    const RiderLocation = mongoose.connection.db.collection('riderlocations');
    const locations = await RiderLocation.find({
      riderId: new mongoose.Types.ObjectId(userId)
    })
    .sort({ timestamp: -1 })
    .limit(parseInt(limit))
    .skip(parseInt(offset))
    .toArray();

    const transformedLocations = locations.map(location => ({
      lat: location.coordinates.latitude,
      lng: location.coordinates.longitude,
      timestamp: location.timestamp.toISOString(),
      accuracy: location.accuracy,
      speed: location.speed,
      heading: location.heading,
      orderId: location.orderId
    }));

    res.json({
      success: true,
      data: {
        locations: transformedLocations,
        total: transformedLocations.length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

router.get('/geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: lat, lng'
      });
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude) ||
        latitude < -90 || latitude > 90 || 
        longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates'
      });
    }

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await axios.get(geocodeUrl);
    
    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const formattedAddress = response.data.results[0].formatted_address;
      res.json({
        success: true,
        data: {
          formattedAddress,
          latitude,
          longitude,
          addressComponents: response.data.results[0].address_components
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          formattedAddress: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
          latitude,
          longitude
        }
      });
    }

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Geocoding service unavailable'
    });
  }
});

export default router;
