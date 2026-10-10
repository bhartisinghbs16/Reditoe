/**
 * Admin settings routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import axios from 'axios';
import {
  getSettings,
  updateSettings,
  updateDeliverySettings,
  updateCancellationSettings,
  updateTaxSettings,
  updateAppVersionSettings,
  updateCmsPages,
  updateWalletReferralSettings,
  getAuditTrail,
  getPublicSettings,
} from '../../controllers/admin/adminSettingsController.js';

const router = express.Router();
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';

// Reverse geocode (for admin live-tracking)
router.get('/geocode', async (req, res) => {
  try {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }
    const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: { latlng: `${lat},${lng}`, key: GOOGLE_MAPS_API_KEY }
    });
    const data = response.data;
    if (data.status !== 'OK' || !data.results?.length) {
      return res.status(404).json({ success: false, message: 'Address not found for coordinates' });
    }
    res.json({
      success: true,
      data: {
        formattedAddress: data.results[0].formatted_address,
        placeId: data.results[0].place_id
      }
    });
  } catch (error) {
    console.error('Error reverse geocoding:', error);
    res.status(500).json({ success: false, message: 'Internal server error while reverse geocoding' });
  }
});

// Health check (public, for monitoring)
router.get('/health', async (req, res) => {
  try {
    const Settings = (await import('../../models/Settings.js')).default;
    new Settings();
    res.status(200).json({ status: 'success', message: 'Settings model is working', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Settings model failed', error: error.message });
  }
});

// Admin-only routes
router.get('/', getSettings);
// The per-section PATCH routes below each cover one settings tab; this saves
// any combination of them in a single call, which is what the admin console does.
router.put('/', updateSettings);
router.get('/audit-trail', getAuditTrail);
router.patch('/delivery', updateDeliverySettings);
router.patch('/cancellation', updateCancellationSettings);
router.patch('/tax', updateTaxSettings);
router.patch('/wallet-referral', updateWalletReferralSettings);
router.patch('/app-version', updateAppVersionSettings);
router.patch('/cms-pages', updateCmsPages);

// Public route (for mobile apps)
router.get('/public', getPublicSettings);

export default router;
