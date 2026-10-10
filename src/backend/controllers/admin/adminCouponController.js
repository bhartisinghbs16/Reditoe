import Coupon from '../../models/Coupon.js';
import mongoose from 'mongoose';

const toNumberOrUndefined = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? undefined : numberValue;
};

const getUserId = (req) => req.user?._id || req.user?.id;

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

const buildCouponPayload = (body, userId, existing = {}) => {
  const discountType = body.discountType || body.type;
  const minOrderAmount = toNumberOrUndefined(body.minOrderAmount ?? body.minOrderValue);
  const maxDiscountAmount = toNumberOrUndefined(body.maxDiscountAmount ?? body.maxDiscount);
  const usageLimit = toNumberOrUndefined(body.usageLimit);
  const discountValue = toNumberOrUndefined(body.discountValue);
  // The admin console names the window validFrom/validTill; the model calls it
  // startDate/endDate. Both spellings are accepted so neither caller has to
  // translate.
  const expiryDate = body.expiryDate ?? body.endDate ?? body.validTill;
  const startDate = body.startDate ?? body.validFrom;
  const applicableRestaurants = body.applicableRestaurants;
  const userType = body.userType || 'all';

  const payload = {};
  payload.userType = userType;

  if (body.code !== undefined) payload.code = String(body.code).toUpperCase().trim();
  if (
    body.name !== undefined ||
    body.title !== undefined ||
    body.description !== undefined ||
    body.code !== undefined
  ) {
    payload.name =
      body.name || body.title || body.description || body.code || existing.name;
  }
  if (body.description !== undefined) payload.description = body.description || '';
  if (discountType !== undefined) payload.type = discountType;
  if (discountValue !== undefined) payload.discountValue = discountValue;
  if (minOrderAmount !== undefined) payload.minOrderValue = minOrderAmount;
  if (maxDiscountAmount !== undefined) payload.maxDiscount = maxDiscountAmount;
  if (expiryDate !== undefined) payload.endDate = expiryDate ? new Date(expiryDate) : existing.endDate;
  if (startDate !== undefined) payload.startDate = startDate ? new Date(startDate) : existing.startDate;
  if (usageLimit !== undefined) payload.usageLimit = usageLimit;
  if (body.isActive !== undefined) payload.isActive = body.isActive;
  if (applicableRestaurants !== undefined) {
    payload.applicableRestaurants = applicableRestaurants || [];
    payload.isGlobal = !applicableRestaurants || applicableRestaurants.length === 0;
  }
  if (userId && !existing.createdBy) payload.createdBy = userId;
  if (userId && existing.createdBy) payload.updatedBy = userId;

  return payload;
};

// GET /api/admin/coupons
export const getCoupons = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      search,
    } = req.query;

    const query = {};

    if (search) {
      query.code = { $regex: search, $options: 'i' };
    }

    if (status === 'active') {
      query.isActive = true;
      query.endDate = { $gte: new Date() };
    } else if (status === 'expired') {
      query.endDate = { $lt: new Date() };
    } else if (status === 'inactive') {
      query.isActive = false;
    }

    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const total = await Coupon.countDocuments(query);
    const coupons = await Coupon.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .lean();

    return res.status(200).json({
      status: 'success',
      data: { coupons: coupons.map(mapCouponResponse) },
      total,
      page: pageNumber,
      totalPages: Math.ceil(total / limitNumber),
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch coupons',
    });
  }
};

// GET /api/admin/coupons/:id
export const getCouponById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid coupon ID',
      });
    }
    const coupon = await Coupon.findById(id).lean();
    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
      });
    }
    return res.status(200).json({
      status: 'success',
      data: { coupon: mapCouponResponse(coupon) },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch coupon',
    });
  }
};

// POST /api/admin/coupons
export const createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      type,
      discountValue,
      expiryDate,
      endDate,
      validTill,
    } = req.body;

    if (
      !code ||
      !(discountType || type) ||
      discountValue === undefined ||
      !(expiryDate || endDate || validTill)
    ) {
      return res.status(400).json({
        status: 'error',
        message: 'Code, discount type, discount value, and expiry date are required',
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

    const coupon = await Coupon.create(buildCouponPayload(req.body, getUserId(req)));

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

// PUT /api/admin/coupons/:id
export const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid coupon ID',
      });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
      });
    }

    const payload = buildCouponPayload(req.body, getUserId(req), coupon);
    Object.assign(coupon, payload);
    await coupon.save();

    return res.status(200).json({
      status: 'success',
      message: 'Coupon updated successfully',
      data: { coupon: mapCouponResponse(coupon) },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update coupon',
    });
  }
};

// DELETE /api/admin/coupons/:id
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid coupon ID',
      });
    }
    const coupon = await Coupon.findByIdAndDelete(id);
    if (!coupon) {
      return res.status(404).json({
        status: 'error',
        message: 'Coupon not found',
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

// PATCH /api/admin/coupons/:id/toggle
export const toggleCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid coupon ID',
      });
    }
    const coupon = await Coupon.findById(id);
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

// GET /api/admin/coupons/stats
export const getCouponStats = async (req, res) => {
  try {
    const now = new Date();
    const [total, active, expired, inactive] = await Promise.all([
      Coupon.countDocuments({}),
      Coupon.countDocuments({
        isActive: true,
        endDate: { $gte: now },
      }),
      Coupon.countDocuments({
        endDate: { $lt: now },
      }),
      Coupon.countDocuments({ isActive: false }),
    ]);

    return res.status(200).json({
      status: 'success',
      data: { total, active, expired, inactive },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch coupon stats',
    });
  }
};