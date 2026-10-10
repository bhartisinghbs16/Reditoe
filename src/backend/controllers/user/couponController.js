import Coupon from '../../models/Coupon.js';

export const validateCoupon = async (req, res) => {
  try {
    const { code, orderTotal, orderSubtotal, restaurantId } = req.body;
    const userId = req.user?._id || req.user?.id;
    const billTotal = Number(orderTotal || 0);
    const discountBase = Number.isFinite(Number(orderSubtotal))
      ? Number(orderSubtotal)
      : billTotal;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code is required',
      });
    }

    if (!Number.isFinite(discountBase) || discountBase <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid order amount',
      });
    }

    const coupon = await Coupon.findOne({
      code: code.toUpperCase().trim(),
      isActive: true,
      isPublic: true,
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired coupon code',
      });
    }

    const now = new Date();
    if (coupon.startDate && now < coupon.startDate) {
      return res.status(400).json({
        success: false,
        message: 'Coupon is not active yet',
      });
    }
    if (coupon.endDate && now > coupon.endDate) {
      return res.status(400).json({
        success: false,
        message: 'Coupon has expired',
      });
    }

    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: 'Coupon usage limit reached',
      });
    }

    if (coupon.perUserLimit) {
      const userUsageCount = coupon.redemptionHistory.filter(
        r => r.userId?.toString() === userId?.toString()
      ).length;
      if (userUsageCount >= coupon.perUserLimit) {
        return res.status(400).json({
          success: false,
          message: 'You have already used this coupon',
        });
      }
    }

    if (coupon.minOrderValue && discountBase < coupon.minOrderValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum order value is ₹${coupon.minOrderValue}`,
      });
    }

    if (!coupon.isGlobal && coupon.applicableRestaurants?.length > 0) {
      const isApplicable = coupon.applicableRestaurants.some(
        r => r.toString() === restaurantId?.toString()
      );
      if (!isApplicable) {
        return res.status(400).json({
          success: false,
          message: 'Coupon is not valid for this restaurant',
        });
      }
    }

    let discountAmount = 0;
    if (coupon.type === 'flat') {
      discountAmount = coupon.discountValue;
    } else if (coupon.type === 'percentage') {
      discountAmount = (discountBase * coupon.discountValue) / 100;
      if (coupon.maxDiscount) {
        discountAmount = Math.min(discountAmount, coupon.maxDiscount);
      }
    } else if (coupon.type === 'bogo') {
      discountAmount = coupon.discountValue;
    }

    discountAmount = Math.min(discountAmount, discountBase);
    discountAmount = Math.round(discountAmount);

    return res.json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        code: coupon.code,
        name: coupon.name,
        description: coupon.description,
        type: coupon.type,
        discountValue: coupon.discountValue,
        discountAmount,
        finalTotal: Math.max(0, billTotal - discountAmount),
      },
    });
  } catch (err) {
    console.error('Coupon validate error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
    });
  }
};

export const getAvailableCoupons = async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const now = new Date();
    
    // Base query for active, public, and valid coupons
    const query = {
      isActive: true,
      isPublic: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    };

    // If restaurant is provided, we can filter globally applicable OR restaurant-specific coupons
    if (restaurantId) {
      query.$or = [
        { isGlobal: true },
        { applicableRestaurants: restaurantId }
      ];
    }

    const coupons = await Coupon.find(query).sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: { coupons },
    });
  } catch (err) {
    console.error('Fetch coupons error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch coupons',
    });
  }
};
