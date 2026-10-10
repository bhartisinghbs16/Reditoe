/**
 * Admin Marketing Controller
 * Handles marketing campaigns, coupons, referrals, banners, and analytics
 */
import Coupon from '../../models/Coupon.js';
import Referral from '../../models/Referral.js';
import { getFilePath } from '../../middleware/uploadMiddleware.js';
import Banner from '../../models/Banner.js';
import LocationOffer from '../../models/LocationOffer.js';
import CampaignAnalytics from '../../models/CampaignAnalytics.js';
import Restaurant from '../../models/Restaurant.js';
import User from '../../models/User.js';

// ==================== COUPONS ====================

/**
 * GET /api/admin/marketing/coupons
 * Get all coupons with pagination and filters
 */
export const getCoupons = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      status,
      restaurant,
    } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (type) query.type = type;
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }
    
    if (restaurant) {
      query.applicableRestaurants = restaurant;
    }

    const coupons = await Coupon.find(query)
      .populate('applicableRestaurants', 'name')
      .populate('applicableFoodItems', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Coupon.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        coupons,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch coupons',
    });
  }
};

/**
 * POST /api/admin/marketing/coupons
 * Create a new coupon
 */
export const createCoupon = async (req, res) => {
  try {
    const couponData = {
      ...req.body,
      createdBy: req.user?._id || req.user?.id,
    };

    // Validate restaurant IDs if provided
    if (couponData.applicableRestaurants && couponData.applicableRestaurants.length > 0) {
      const restaurants = await Restaurant.find({ _id: { $in: couponData.applicableRestaurants } });
      if (restaurants.length !== couponData.applicableRestaurants.length) {
        return res.status(400).json({
          status: 'error',
          message: 'One or more restaurant IDs are invalid',
        });
      }
    }

    const coupon = new Coupon(couponData);
    await coupon.save();

    const populatedCoupon = await Coupon.findById(coupon._id)
      .populate('applicableRestaurants', 'name')
      .populate('applicableFoodItems', 'name')
      .populate('createdBy', 'name');

    res.status(201).json({
      status: 'success',
      message: 'Coupon created successfully',
      data: {
        coupon: populatedCoupon,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'error',
        message: 'Coupon code already exists',
      });
    }
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create coupon',
    });
  }
};

/**
 * PUT /api/admin/marketing/coupons/:id
 * Update a coupon
 */
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedBy: req.user?.id,
    };

    // Validate restaurant IDs if provided
    if (updateData.applicableRestaurants && updateData.applicableRestaurants.length > 0) {
      const restaurants = await Restaurant.find({ _id: { $in: updateData.applicableRestaurants } });
      if (restaurants.length !== updateData.applicableRestaurants.length) {
        return res.status(400).json({
          status: 'error',
          message: 'One or more restaurant IDs are invalid',
        });
      }
    }

    const coupon = await Coupon.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('applicableRestaurants', 'name')
      .populate('applicableFoodItems', 'name')
      .populate('updatedBy', 'name');

    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Coupon updated successfully',
      data: {
        coupon,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        status: 'error',
        message: 'Coupon code already exists',
      });
    }
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update coupon',
    });
  }
};

/**
 * DELETE /api/admin/marketing/coupons/:id
 * Delete a coupon
 */
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;

    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Coupon deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete coupon',
    });
  }
};

/**
 * GET /api/admin/marketing/coupons/:id/analytics
 * Get coupon analytics and redemption history
 */
export const getCouponAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const coupon = await Coupon.getUsageStats(id);
    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
      });
    }

    let redemptions = coupon.redemptionHistory;
    
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      redemptions = redemptions.filter(r => r.redeemedAt >= start && r.redeemedAt <= end);
    }

    const analytics = {
      totalRedemptions: redemptions.length,
      totalDiscount: redemptions.reduce((sum, r) => sum + r.discountAmount, 0),
      averageDiscount: redemptions.length > 0 ? redemptions.reduce((sum, r) => sum + r.discountAmount, 0) / redemptions.length : 0,
      uniqueUsers: new Set(redemptions.map(r => r.userId?.toString()).filter(Boolean)).size,
      redemptionsByRestaurant: {},
      redemptionsByDate: {},
      recentRedemptions: redemptions.slice(-10).reverse(),
    };

    redemptions.forEach(r => {
      // Group by restaurant
      const restaurantName = r.restaurantId?.name || 'Unknown';
      if (!analytics.redemptionsByRestaurant[restaurantName]) {
        analytics.redemptionsByRestaurant[restaurantName] = { count: 0, discount: 0 };
      }
      analytics.redemptionsByRestaurant[restaurantName].count += 1;
      analytics.redemptionsByRestaurant[restaurantName].discount += r.discountAmount;

      // Group by date
      const date = r.redeemedAt.toDateString();
      if (!analytics.redemptionsByDate[date]) {
        analytics.redemptionsByDate[date] = { count: 0, discount: 0 };
      }
      analytics.redemptionsByDate[date].count += 1;
      analytics.redemptionsByDate[date].discount += r.discountAmount;
    });

    res.status(200).json({
      status: 'success',
      data: {
        coupon: {
          id: coupon._id,
          code: coupon.code,
          name: coupon.name,
          type: coupon.type,
          isActive: coupon.isValid(),
        },
        analytics,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch coupon analytics',
    });
  }
};

// ==================== REFERRALS ====================

/**
 * GET /api/admin/marketing/referrals
 * Get referral program configuration and analytics
 */
export const getReferralProgram = async (req, res) => {
  try {
    let referralProgram = await Referral.getReferralProgram();
    
    if (!referralProgram) {
      // Create default referral program
      referralProgram = new Referral({
        programName: 'Vinsta Referral Program',
        description: 'Invite friends and earn rewards!',
        referrerReward: {
          type: 'cashback',
          value: 50,
          description: '₹50 cashback for each successful referral',
        },
        refereeReward: {
          type: 'discount',
          value: 100,
          description: '₹100 discount on first order',
        },
        createdBy: req.user?.id,
      });
      await referralProgram.save();
    }

    const analytics = await Referral.getReferralAnalytics();

    res.status(200).json({
      status: 'success',
      data: {
        referralProgram,
        analytics,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch referral program',
    });
  }
};

/**
 * PUT /api/admin/marketing/referrals
 * Update referral program configuration
 */
export const updateReferralProgram = async (req, res) => {
  try {
    const referralProgram = await Referral.findOne({ isActive: true });
    
    if (!referralProgram) {
      return res.status(404).json({
        status: 'error',
        message: 'Referral program not found',
      });
    }

    const updateData = {
      ...req.body,
      updatedBy: req.user?.id,
    };

    Object.assign(referralProgram, updateData);
    await referralProgram.save();

    res.status(200).json({
      status: 'success',
      message: 'Referral program updated successfully',
      data: {
        referralProgram,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update referral program',
    });
  }
};

/**
 * GET /api/admin/marketing/referrals/user-code/:userId
 * Get referral code for a specific user
 */
export const getUserReferralCode = async (req, res) => {
  try {
    const { userId } = req.params;

    // First check Referral program's referralCodes
    let code = await Referral.getUserReferralCode(userId);

    // Fallback to User's referralCode (auto-generated on registration)
    if (!code) {
      const user = await User.findById(userId).select('referralCode');
      code = user?.referralCode || null;
    }

    res.status(200).json({
      status: 'success',
      data: {
        code,
        userId,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch user referral code',
    });
  }
};

/**
 * POST /api/admin/marketing/referrals/generate-code
 * Generate referral code for a user (adds to Referral program)
 */
export const generateReferralCode = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        status: 'error',
        message: 'userId is required',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found',
      });
    }

    let referralProgram = await Referral.findOne({ isActive: true });
    if (!referralProgram) {
      referralProgram = new Referral({
        programName: 'Vinsta Referral Program',
        description: 'Invite friends and earn rewards!',
        referrerReward: { type: 'cashback', value: 50 },
        refereeReward: { type: 'discount', value: 100 },
        createdBy: req.user?.id,
      });
      await referralProgram.save();
    }

    // Check if user already has a code in the program
    const existingCode = referralProgram.referralCodes.find(
      (rc) => rc.referrerId.toString() === userId && !rc.isUsed
    );
    if (existingCode) {
      return res.status(200).json({
        status: 'success',
        data: {
          code: existingCode.code,
          userId,
          message: 'User already has an active referral code',
        },
      });
    }

    await referralProgram.generateReferralCode(userId);
    const updated = await Referral.findOne({ isActive: true });
    const newCode = updated.referralCodes.find(
      (rc) => rc.referrerId.toString() === userId && !rc.isUsed
    );

    res.status(201).json({
      status: 'success',
      data: {
        code: newCode?.code || user.referralCode,
        userId,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to generate referral code',
    });
  }
};

/**
 * GET /api/admin/marketing/referrals/analytics
 * Get detailed referral analytics
 */
export const getReferralAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const referralProgram = await Referral.findOne({ isActive: true })
      .populate('referralHistory.referrerId', 'name email')
      .populate('referralHistory.refereeId', 'name email');

    if (!referralProgram) {
      return res.status(404).json({
        status: 'error',
        message: 'Referral program not found',
      });
    }

    let referrals = referralProgram.referralHistory;
    
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : new Date(0);
      const end = endDate ? new Date(endDate) : new Date();
      referrals = referrals.filter(r => r.createdAt >= start && r.createdAt <= end);
    }

    const analytics = {
      totalReferrals: referrals.length,
      pendingReferrals: referrals.filter(r => r.status === 'pending').length,
      completedReferrals: referrals.filter(r => r.status === 'completed').length,
      expiredReferrals: referrals.filter(r => r.status === 'expired').length,
      conversionRate: referrals.length > 0 ? (referrals.filter(r => r.status === 'completed').length / referrals.length) * 100 : 0,
      totalRewards: referrals.reduce((sum, r) => sum + r.referrerRewardAmount + r.refereeRewardAmount, 0),
      topReferrers: {},
      referralsByDate: {},
    };

    // Calculate top referrers
    referrals.forEach(r => {
      const referrerName = r.referrerId?.name || 'Unknown';
      if (!analytics.topReferrers[referrerName]) {
        analytics.topReferrers[referrerName] = { count: 0, rewards: 0 };
      }
      analytics.topReferrers[referrerName].count += 1;
      analytics.topReferrers[referrerName].rewards += r.referrerRewardAmount;

      // Group by date
      const date = r.createdAt.toDateString();
      if (!analytics.referralsByDate[date]) {
        analytics.referralsByDate[date] = { count: 0, completed: 0 };
      }
      analytics.referralsByDate[date].count += 1;
      if (r.status === 'completed') {
        analytics.referralsByDate[date].completed += 1;
      }
    });

    // Sort top referrers
    analytics.topReferrers = Object.entries(analytics.topReferrers)
      .sort(([,a], [,b]) => b.count - a.count)
      .slice(0, 10)
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

    res.status(200).json({
      status: 'success',
      data: {
        analytics,
        recentReferrals: referrals.slice(-10).reverse(),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch referral analytics',
    });
  }
};

// ==================== BANNERS ====================

/**
 * GET /api/admin/marketing/banners/active
 * Get active banners only (for app/homepage display)
 */
export const getActiveBanners = async (req, res) => {
  try {
    const { position } = req.query;

    const query = { isActive: true };
    if (position) query.position = position;

    const banners = await Banner.find(query)
      .populate('targetRestaurants', 'name')
      .sort({ displayOrder: 1, createdAt: -1 });

    res.status(200).json({
      status: 'success',
      data: banners,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch active banners',
    });
  }
};

/**
 * GET /api/admin/marketing/banners
 * Get all banners with pagination and filters
 */
export const getBanners = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      position,
      status,
    } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (type) query.bannerType = type;
    if (position) query.position = position;
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const banners = await Banner.find(query)
      .populate('targetRestaurants', 'name')
      .populate('createdBy', 'name')
      .sort({ displayOrder: 1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Banner.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        banners,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch banners',
    });
  }
};

/**
 * POST /api/admin/marketing/banners
 * Create a new banner
 */
/**
 * POST /api/admin/marketing/banners/image
 *
 * Stores a poster image and hands back its URL, so the banner form can send
 * an address rather than a file and the same image can be reused.
 */
export const uploadBannerImageFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: 'error', message: 'No image uploaded' });
    }
    const relative = getFilePath('banners', req.file.filename);
    // Absolute, because the apps and the console are on different hosts.
    const base = process.env.PUBLIC_API_URL || `${req.protocol}://${req.get('host')}`;
    return res.status(201).json({
      status: 'success',
      data: { url: `${base}/${relative}` },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const createBanner = async (req, res) => {
  try {
    const bannerData = {
      ...req.body,
      createdBy: req.user?.id,
    };

    // Validate restaurant IDs if provided
    if (bannerData.targetRestaurants && bannerData.targetRestaurants.length > 0) {
      const restaurants = await Restaurant.find({ _id: { $in: bannerData.targetRestaurants } });
      if (restaurants.length !== bannerData.targetRestaurants.length) {
        return res.status(400).json({
          status: 'error',
          message: 'One or more restaurant IDs are invalid',
        });
      }
    }

    const banner = new Banner(bannerData);
    await banner.save();

    const populatedBanner = await Banner.findById(banner._id)
      .populate('targetRestaurants', 'name')
      .populate('createdBy', 'name');

    res.status(201).json({
      status: 'success',
      message: 'Banner created successfully',
      data: {
        banner: populatedBanner,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create banner',
    });
  }
};

/**
 * PUT /api/admin/marketing/banners/:id
 * Update a banner
 */
export const updateBanner = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedBy: req.user?.id,
    };

    // Validate restaurant IDs if provided
    if (updateData.targetRestaurants && updateData.targetRestaurants.length > 0) {
      const restaurants = await Restaurant.find({ _id: { $in: updateData.targetRestaurants } });
      if (restaurants.length !== updateData.targetRestaurants.length) {
        return res.status(400).json({
          status: 'error',
          message: 'One or more restaurant IDs are invalid',
        });
      }
    }

    const banner = await Banner.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('targetRestaurants', 'name')
      .populate('updatedBy', 'name');

    if (!banner) {
      return res.status(404).json({
        status: 'error',
        message: 'Banner not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Banner updated successfully',
      data: {
        banner,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update banner',
    });
  }
};

/**
 * DELETE /api/admin/marketing/banners/:id
 * Delete a banner
 */
export const deleteBanner = async (req, res) => {
  try {
    const { id } = req.params;

    const banner = await Banner.findByIdAndDelete(id);
    if (!banner) {
      return res.status(404).json({
        status: 'error',
        message: 'Banner not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Banner deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete banner',
    });
  }
};

/**
 * GET /api/admin/marketing/banners/:id/analytics
 * Get banner analytics
 */
export const getBannerAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({
        status: 'error',
        message: 'Banner not found',
      });
    }

    const analytics = banner.getAnalytics(startDate, endDate);

    res.status(200).json({
      status: 'success',
      data: {
        banner: {
          id: banner._id,
          title: banner.title,
          position: banner.position,
          bannerType: banner.bannerType,
          isActive: banner.isCurrentlyActive(),
        },
        analytics,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch banner analytics',
    });
  }
};

// ==================== LOCATION OFFERS ====================

/**
 * GET /api/admin/marketing/location-offers
 * Get all location offers with pagination and filters
 */
export const getLocationOffers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      type,
      city,
      status,
    } = req.query;

    const query = {};
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (type) query.offerType = type;
    if (city) query.targetCities = city;
    if (status === 'active') {
      query.isActive = true;
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const offers = await LocationOffer.find(query)
      .populate('applicableRestaurants', 'name')
      .populate('excludedRestaurants', 'name')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await LocationOffer.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        offers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch location offers',
    });
  }
};

/**
 * POST /api/admin/marketing/location-offers
 * Create a new location offer
 */
export const createLocationOffer = async (req, res) => {
  try {
    const offerData = {
      ...req.body,
      createdBy: req.user?.id,
    };

    // Validate restaurant IDs if provided
    if (offerData.applicableRestaurants && offerData.applicableRestaurants.length > 0) {
      const restaurants = await Restaurant.find({ _id: { $in: offerData.applicableRestaurants } });
      if (restaurants.length !== offerData.applicableRestaurants.length) {
        return res.status(400).json({
          status: 'error',
          message: 'One or more restaurant IDs are invalid',
        });
      }
    }

    const offer = new LocationOffer(offerData);
    await offer.save();

    const populatedOffer = await LocationOffer.findById(offer._id)
      .populate('applicableRestaurants', 'name')
      .populate('excludedRestaurants', 'name')
      .populate('createdBy', 'name');

    res.status(201).json({
      status: 'success',
      message: 'Location offer created successfully',
      data: {
        offer: populatedOffer,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create location offer',
    });
  }
};

/**
 * PUT /api/admin/marketing/location-offers/:id
 * Update a location offer
 */
export const updateLocationOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedBy: req.user?.id,
    };

    // Validate restaurant IDs if provided
    if (updateData.applicableRestaurants && updateData.applicableRestaurants.length > 0) {
      const restaurants = await Restaurant.find({ _id: { $in: updateData.applicableRestaurants } });
      if (restaurants.length !== updateData.applicableRestaurants.length) {
        return res.status(400).json({
          status: 'error',
          message: 'One or more restaurant IDs are invalid',
        });
      }
    }

    const offer = await LocationOffer.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    )
      .populate('applicableRestaurants', 'name')
      .populate('excludedRestaurants', 'name')
      .populate('updatedBy', 'name');

    if (!offer) {
      return res.status(404).json({
        status: 'error',
        message: 'Location offer not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Location offer updated successfully',
      data: {
        offer,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update location offer',
    });
  }
};

/**
 * DELETE /api/admin/marketing/location-offers/:id
 * Delete a location offer
 */
export const deleteLocationOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await LocationOffer.findByIdAndDelete(id);
    if (!offer) {
      return res.status(404).json({
        status: 'error',
        message: 'Location offer not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Location offer deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete location offer',
    });
  }
};

/**
 * GET /api/admin/marketing/location-offers/:id/analytics
 * Get location offer analytics
 */
export const getLocationOfferAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const offer = await LocationOffer.findById(id);
    if (!offer) {
      return res.status(404).json({
        status: 'error',
        message: 'Location offer not found',
      });
    }

    const analytics = offer.getAnalytics(startDate, endDate);

    res.status(200).json({
      status: 'success',
      data: {
        offer: {
          id: offer._id,
          title: offer.title,
          offerType: offer.offerType,
          targetCities: offer.targetCities,
          isActive: offer.isCurrentlyActive(),
        },
        analytics,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch location offer analytics',
    });
  }
};

// ==================== CAMPAIGN ANALYTICS ====================

/**
 * GET /api/admin/marketing/analytics
 * Get comprehensive campaign analytics
 */
export const getCampaignAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, campaignType } = req.query;

    const analytics = {
      coupons: await Coupon.find({}),
      banners: await Banner.getBannerAnalytics(startDate, endDate),
      locationOffers: await LocationOffer.getLocationOfferAnalytics(startDate, endDate),
      referrals: await Referral.getReferralAnalytics(startDate, endDate),
    };

    // Calculate overall metrics
    const overallMetrics = {
      totalCampaigns: 0,
      activeCampaigns: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      totalRedemptions: 0,
      totalDiscount: 0,
    };

    // Coupon metrics
    overallMetrics.totalCampaigns += analytics.coupons.length;
    overallMetrics.activeCampaigns += analytics.coupons.filter(c => c.isValid()).length;
    overallMetrics.totalRedemptions += analytics.coupons.reduce((sum, c) => sum + c.usedCount, 0);
    overallMetrics.totalDiscount += analytics.coupons.reduce((sum, c) => 
      sum + c.redemptionHistory.reduce((discountSum, r) => discountSum + r.discountAmount, 0), 0
    );

    // Banner metrics
    overallMetrics.totalCampaigns += analytics.banners.length;
    overallMetrics.activeCampaigns += analytics.banners.filter(b => b.isActive).length;
    overallMetrics.totalImpressions += analytics.banners.reduce((sum, b) => sum + b.analytics.impressions, 0);
    overallMetrics.totalClicks += analytics.banners.reduce((sum, b) => sum + b.analytics.clicks, 0);

    // Location offer metrics
    overallMetrics.totalCampaigns += analytics.locationOffers.length;
    overallMetrics.activeCampaigns += analytics.locationOffers.filter(o => o.isActive).length;
    overallMetrics.totalRedemptions += analytics.locationOffers.reduce((sum, o) => sum + o.analytics.totalRedemptions, 0);
    overallMetrics.totalDiscount += analytics.locationOffers.reduce((sum, o) => sum + o.analytics.totalDiscount, 0);

    // Referral metrics
    if (analytics.referrals) {
      overallMetrics.totalCampaigns += 1;
      overallMetrics.activeCampaigns += 1;
      overallMetrics.totalConversions += analytics.referrals.completed;
      overallMetrics.totalDiscount += analytics.referrals.totalRewards;
    }

    res.status(200).json({
      status: 'success',
      data: {
        overallMetrics,
        analytics,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch campaign analytics',
    });
  }
};

/**
 * GET /api/admin/marketing/analytics/export
 * Export campaign analytics
 */
export const exportCampaignAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, format = 'csv', campaignIds } = req.query;

    let data = [];
    
    if (campaignIds) {
      // Export specific campaigns
      const ids = campaignIds.split(',');
      data = await CampaignAnalytics.exportAnalytics(ids, format);
    } else {
      // Export all campaigns
      const coupons = await Coupon.find({});
      const banners = await Banner.getBannerAnalytics(startDate, endDate);
      const locationOffers = await LocationOffer.getLocationOfferAnalytics(startDate, endDate);

      if (format === 'csv') {
        const headers = ['Campaign Type', 'Name', 'Status', 'Impressions', 'Clicks', 'Conversions', 'Redemptions', 'Total Discount'];
        const rows = [];

        // Add coupon data
        coupons.forEach(coupon => {
          rows.push([
            'Coupon',
            coupon.name,
            coupon.isValid() ? 'Active' : 'Inactive',
            0,
            0,
            0,
            coupon.usedCount,
            coupon.redemptionHistory.reduce((sum, r) => sum + r.discountAmount, 0),
          ]);
        });

        // Add banner data
        banners.forEach(banner => {
          rows.push([
            'Banner',
            banner.title,
            banner.isActive ? 'Active' : 'Inactive',
            banner.analytics.impressions,
            banner.analytics.clicks,
            banner.analytics.uniqueUsers,
            0,
            0,
          ]);
        });

        // Add location offer data
        locationOffers.forEach(offer => {
          rows.push([
            'Location Offer',
            offer.title,
            offer.isActive ? 'Active' : 'Inactive',
            0,
            0,
            0,
            offer.analytics.totalRedemptions,
            offer.analytics.totalDiscount,
          ]);
        });

        data = [headers, ...rows];
      } else {
        data = {
          coupons: coupons.map(c => ({
            name: c.name,
            type: 'Coupon',
            status: c.isValid() ? 'Active' : 'Inactive',
            redemptions: c.usedCount,
            totalDiscount: c.redemptionHistory.reduce((sum, r) => sum + r.discountAmount, 0),
          })),
          banners: banners.map(b => ({
            name: b.title,
            type: 'Banner',
            status: b.isActive ? 'Active' : 'Inactive',
            ...b.analytics,
          })),
          locationOffers: locationOffers.map(o => ({
            name: o.title,
            type: 'Location Offer',
            status: o.isActive ? 'Active' : 'Inactive',
            ...o.analytics,
          })),
        };
      }
    }

    res.status(200).json({
      status: 'success',
      message: 'Analytics exported successfully',
      data,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to export analytics',
    });
  }
};
