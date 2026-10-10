import Coupon from '../../models/Coupon.js';
import mongoose from 'mongoose';

const toNumberOrUndefined = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? undefined : numberValue;
};

const mapCouponResponse = (coupon) => {
  if (!coupon) return coupon;
  const data = typeof coupon.toObject === 'function' ? coupon.toObject() : { ...coupon };
  return {
    ...data,
    discountType: data.type,
    minOrderAmount: data.minOrderValue,
    maxDiscountAmount: data.maxDiscount,
    expiryDate: data.endDate,
  };
};

const getUserId = (req) => req.user?._id || req.user?.id;

const getRestaurantId = (req) => req.restaurantId || req.vendorId;

const buildVendorCouponPayload = (body, restaurantId, userId) => {
  const discountType = body.discountType || body.type;
  const minOrderAmount = toNumberOrUndefined(body.minOrderAmount ?? body.minOrderValue);
  const maxDiscountAmount = toNumberOrUndefined(body.maxDiscountAmount ?? body.maxDiscount);
  const usageLimit = toNumberOrUndefined(body.usageLimit);
  const discountValue = toNumberOrUndefined(body.discountValue);
  const expiryDate = body.expiryDate ?? body.endDate;

  return {
    code: String(body.code).toUpperCase().trim(),
    name: body.name || body.description || body.code,
    description: body.description || '',
    type: discountType,
    discountValue,
    minOrderValue: minOrderAmount || 0,
    maxDiscount: maxDiscountAmount,
    endDate: new Date(expiryDate),
    usageLimit,
    isActive: true,
    isGlobal: false,
    applicableRestaurants: [restaurantId],
    /**
     * A vendor's own promotion comes out of the vendor's money.
     *
     * They chose to discount their food, so they carry it - the platform did
     * not agree to fund a sale it had no part in. An admin-created promotion
     * defaults the other way.
     */
    fundedBy: 'vendor',
    createdBy: userId,
  };
};

// GET /api/vendor/coupons
export const getVendorCoupons = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);

    const coupons = await Coupon.find({
      $or: [
        { applicableRestaurants: restaurantId },
        { applicableRestaurants: { $size: 0 } },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: 'success',
      data: { coupons: coupons.map(mapCouponResponse) },
      total: coupons.length,
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch coupons',
    });
  }
};

// POST /api/vendor/coupons
export const createVendorCoupon = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const {
      code,
      discountType,
      type,
      discountValue,
      expiryDate,
      endDate,
    } = req.body;

    if (!code || !(discountType || type) || discountValue === undefined || !(expiryDate || endDate)) {
      return res.status(400).json({
        status: 'error',
        message: 'Code, discount type, value, and expiry date are required',
      });
    }

    const existing = await Coupon.findOne({
      code: code.toUpperCase().trim(),
    });
    if (existing) {
      return res.status(400).json({
        status: 'error',
        message: 'Coupon code already exists',
      });
    }

    const coupon = await Coupon.create(
      buildVendorCouponPayload(req.body, restaurantId, getUserId(req))
    );

    return res.status(201).json({
      status: 'success',
      message: 'Coupon created successfully',
      data: { coupon: mapCouponResponse(coupon) },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create coupon',
    });
  }
};

// PATCH /api/vendor/coupons/:id/toggle
export const toggleVendorCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = getRestaurantId(req);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid coupon ID',
      });
    }

    const coupon = await Coupon.findOne({
      _id: id,
      applicableRestaurants: restaurantId,
    });

    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
      });
    }

    coupon.isActive = !coupon.isActive;
    coupon.updatedBy = getUserId(req);
    await coupon.save();

    return res.status(200).json({
      status: 'success',
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}`,
      data: { coupon: mapCouponResponse(coupon) },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to toggle coupon',
    });
  }
};

// DELETE /api/vendor/coupons/:id
export const deleteVendorCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const restaurantId = getRestaurantId(req);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid coupon ID',
      });
    }

    const coupon = await Coupon.findOneAndDelete({
      _id: id,
      applicableRestaurants: restaurantId,
    });

    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found or not authorized',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Coupon deleted successfully',
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete coupon',
    });
  }
};