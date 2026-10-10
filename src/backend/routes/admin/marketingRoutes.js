/**
 * Admin marketing routes. All protected by adminProtect (applied in index).
 */
import express from 'express';
import { uploadBannerImage, handleUploadError } from '../../middleware/uploadMiddleware.js';
import {
  // Coupons
  getCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  getCouponAnalytics,
  
  // Referrals
  getReferralProgram,
  updateReferralProgram,
  getReferralAnalytics,
  getUserReferralCode,
  generateReferralCode,
  
  // Banners
  getBanners,
  getActiveBanners,
  createBanner,
  uploadBannerImageFile,
  updateBanner,
  deleteBanner,
  getBannerAnalytics,
  
  // Location Offers
  getLocationOffers,
  createLocationOffer,
  updateLocationOffer,
  deleteLocationOffer,
  getLocationOfferAnalytics,
  
  // Campaign Analytics
  getCampaignAnalytics,
  exportCampaignAnalytics,
} from '../../controllers/admin/adminMarketingController.js';

const router = express.Router();

// Coupon routes
router.get('/coupons', getCoupons);
router.post('/coupons', createCoupon);
router.put('/coupons/:id', updateCoupon);
router.delete('/coupons/:id', deleteCoupon);
router.get('/coupons/:id/analytics', getCouponAnalytics);

// Referral routes
router.get('/referrals', getReferralProgram);
router.put('/referrals', updateReferralProgram);
router.get('/referrals/user-code/:userId', getUserReferralCode);
router.post('/referrals/generate-code', generateReferralCode);
router.get('/referrals/analytics', getReferralAnalytics);

// Banner routes (active must be before :id)
router.get('/banners/active', getActiveBanners);
router.get('/banners', getBanners);
// POST /api/admin/marketing/banners/image - store a poster and return its URL.
// Before /banners/:id, or "image" is read as an id.
//
// `handleUploadError` sits between the two, as it does on every other upload
// route here. Without it a refused file - wrong format, too large - left multer
// throwing into the generic handler, which answered 500 with nothing the admin
// could act on; now they are told which formats are accepted.
router.post('/banners/image', uploadBannerImage, handleUploadError, uploadBannerImageFile);

router.post('/banners', createBanner);
router.put('/banners/:id', updateBanner);
router.delete('/banners/:id', deleteBanner);
router.get('/banners/:id/analytics', getBannerAnalytics);

// Location Offer routes
router.get('/location-offers', getLocationOffers);
router.post('/location-offers', createLocationOffer);
router.put('/location-offers/:id', updateLocationOffer);
router.delete('/location-offers/:id', deleteLocationOffer);
router.get('/location-offers/:id/analytics', getLocationOfferAnalytics);

// Campaign Analytics routes
router.get('/analytics', getCampaignAnalytics);
router.get('/analytics/export', exportCampaignAnalytics);

export default router;
