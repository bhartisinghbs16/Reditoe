import express from 'express';
import axios from 'axios';

const router = express.Router();

// Google Maps API key from environment
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Validate address using Google Address Validation API
router.post('/validate-address', async (req, res) => {
  try {
    const { address } = req.body;

    if (!address || !address.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Address is required'
      });
    }

    // Call Google Address Validation API
    const validationUrl = `https://addressvalidation.googleapis.com/v1:validateAddress?key=${GOOGLE_MAPS_API_KEY}`;
    
    const requestBody = {
      address: {
        regionCode: 'US', // Default to US, can be made configurable
        addressLines: [address.trim()]
      },
      enableUspsCass: true // Enable USPS address standardization
    };

    const response = await axios.post(validationUrl, requestBody);
    const result = response.data.result;

    if (!result) {
      return res.status(500).json({
        success: false,
        message: 'Failed to validate address with Google API'
      });
    }

    const verdict = result.verdict || {};
    const addressComponents = result.address?.addressComponents || [];
    const formattedAddress = result.address?.formattedAddress;

    // Determine if address is valid
    const isValid = verdict.validationGranularity === 'PREMISE' || 
                   verdict.validationGranularity === 'SUB_PREMISE' ||
                   verdict.validationGranularity === 'ROUTE';

    // Extract address components
    const components = {};
    addressComponents.forEach(component => {
      const componentType = component.componentType?.replace('_', '');
      const componentName = component.componentName?.text;
      
      if (componentType && componentName) {
        switch (componentType) {
          case 'streetNumber':
            components.streetNumber = componentName;
            break;
          case 'route':
            components.route = componentName;
            break;
          case 'locality':
          case 'city':
            components.city = componentName;
            break;
          case 'administrativeArea':
          case 'state':
            components.state = componentName;
            break;
          case 'postalCode':
            components.postalCode = componentName;
            break;
          case 'country':
            components.country = componentName;
            break;
        }
      }
    });

    // Collect any missing or incomplete components
    const errors = [];
    if (!components.streetNumber && verdict.addressComplete?.includes('false')) {
      errors.push('Street number is missing or incomplete');
    }
    if (!components.route && verdict.addressComplete?.includes('false')) {
      errors.push('Street name is missing or incomplete');
    }
    if (!components.city) {
      errors.push('City is missing');
    }
    if (!components.state) {
      errors.push('State is missing');
    }
    if (!components.postalCode) {
      errors.push('Postal code is missing');
    }

    const validationResult = {
      isValid,
      formattedAddress: formattedAddress || address,
      components: Object.keys(components).length > 0 ? components : undefined,
      errors: errors.length > 0 ? errors : undefined,
      confidence: verdict.addressComplete?.[0] === 'true' ? 'high' : 'medium',
      granularity: verdict.validationGranularity
    };

    res.json({
      success: true,
      data: validationResult
    });

  } catch (error) {
    if (error.response?.status === 400) {
      return res.status(400).json({
        success: false,
        message: 'Invalid address format provided to validation service'
      });
    }

    if (error.response?.status === 403) {
      return res.status(500).json({
        success: false,
        message: 'Address validation service is unavailable'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Internal server error while validating address'
    });
  }
});

// Geocode address to get coordinates
router.post('/geocode', async (req, res) => {
  try {
    const { address, lat, lng } = req.body;

    // Handle reverse geocoding (lat/lng to address)
    if (lat && lng) {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
      const params = {
        latlng: `${lat},${lng}`,
        key: GOOGLE_MAPS_API_KEY
      };

      const response = await axios.get(geocodeUrl, { params });
      const data = response.data;

      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Address not found for coordinates',
          details: data.status
        });
      }

      const result = data.results[0];
      
      res.json({
        success: true,
        data: {
          formattedAddress: result.formatted_address,
          placeId: result.place_id
        }
      });
      return;
    }

    // Handle forward geocoding (address to lat/lng)
    if (!address || !address.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Address is required'
      });
    }

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
    const params = {
      address: address.trim(),
      key: GOOGLE_MAPS_API_KEY
    };

    const response = await axios.get(geocodeUrl, { params });
    const data = response.data;

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Address not found',
        details: data.status
      });
    }

    const result = data.results[0];
    const location = result.geometry.location;
    const components = result.address_components;

    // Extract components similar to validation
    const addressComponents = {};
    components.forEach(component => {
      const types = component.types;
      const longName = component.long_name;
      
      if (types.includes('street_number')) {
        addressComponents.streetNumber = longName;
      } else if (types.includes('route')) {
        addressComponents.route = longName;
      } else if (types.includes('locality')) {
        addressComponents.city = longName;
      } else if (types.includes('administrative_area_level_1')) {
        addressComponents.state = longName;
      } else if (types.includes('postal_code')) {
        addressComponents.postalCode = longName;
      } else if (types.includes('country')) {
        addressComponents.country = longName;
      }
    });

    res.json({
      success: true,
      data: {
        lat: location.lat,
        lng: location.lng,
        formattedAddress: result.formatted_address,
        components: addressComponents,
        placeId: result.place_id,
        accuracy: result.geometry.location_type
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error while geocoding address'
    });
  }
});

// GET endpoint for reverse geocoding (to support frontend axios.get)
router.get('/geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json`;
    const params = {
      latlng: `${lat},${lng}`,
      key: GOOGLE_MAPS_API_KEY
    };

    const response = await axios.get(geocodeUrl, { params });
    const data = response.data;

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Address not found for coordinates',
        details: data.status
      });
    }

    const result = data.results[0];
    
    res.json({
      success: true,
      data: {
        formattedAddress: result.formatted_address,
        placeId: result.place_id
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error while reverse geocoding'
    });
  }
});

export default router;
