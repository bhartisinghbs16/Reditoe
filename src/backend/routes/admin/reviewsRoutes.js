import express from 'express';
import mongoose from 'mongoose';
import Review from '../../models/Review.js';
import Order from '../../models/Order.js';
import { deriveOrderNumberFromId } from '../../models/Order.js';
import User from '../../models/User.js';

const router = express.Router();

/** Build orderId with orderNumber for API response. Uses orderNumberMap from Order lookup. */
function ensureOrderNumberOnReview(review, orderNumberMap) {
  const r = review?.toObject ? review.toObject() : (review ? { ...review } : {});
  const rawOid = r.orderId;
  if (rawOid) {
    const oid = rawOid._id ?? rawOid;
    const idStr = String(oid?.toString?.() ?? oid);
    const orderNumber = orderNumberMap?.get(idStr) ?? (typeof rawOid === 'object' && rawOid?.orderNumber ? rawOid.orderNumber : null) ?? deriveOrderNumberFromId(oid);
    r.orderId = { _id: idStr, orderNumber };
  }
  return r;
}

// Get all reviews with pagination and filtering
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    const { 
      status, 
      rating, 
      restaurantId, 
      userId, 
      isVerified,
      startDate,
      endDate 
    } = req.query;

    let query = {};
    
    if (status) query.status = status;
    if (rating) query.rating = parseInt(rating);
    if (restaurantId) query.restaurantId = restaurantId;
    if (userId) query.userId = userId;
    if (isVerified !== undefined) query.isVerified = isVerified === 'true';
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const reviewsRaw = await Review.find(query)
      .populate('userId', 'name email')
      .populate('restaurantId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Review.countDocuments(query);

    // Fetch orderNumbers directly from Order (populate can return null if Order missing)
    const orderIdStrs = [...new Set(reviewsRaw.map((r) => r.orderId?.toString?.()).filter(Boolean))];
    const orderIds = orderIdStrs.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    const orders = orderIds.length > 0
      ? await Order.find({ _id: { $in: orderIds } }).select('orderNumber').lean()
      : [];
    const orderNumberMap = new Map(orders.map((o) => [o._id.toString(), o.orderNumber]).filter(([, v]) => v));

    const reviews = reviewsRaw.map((r) => ensureOrderNumberOnReview(r, orderNumberMap));

    res.json({
      status: 'success',
      data: reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Approve review
router.patch('/:id/approve', async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      {
        status: 'approved',
        isPublic: true,
        moderatedAt: new Date()
      },
      { new: true }
    )
      .populate('userId', 'name email')
      .populate('restaurantId', 'name');

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
    }

    res.json({
      status: 'success',
      success: true,
      message: 'Review approved',
      data: review
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get review by ID
router.get('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('userId', 'name email')
      .populate('restaurantId', 'name')
      .lean();

    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
    }

    const oid = review.orderId;
    const orderIds = oid && mongoose.Types.ObjectId.isValid(oid) ? [new mongoose.Types.ObjectId(oid.toString())] : [];
    const orders = orderIds.length > 0 ? await Order.find({ _id: { $in: orderIds } }).select('orderNumber').lean() : [];
    const orderNumberMap = new Map(orders.map((o) => [o._id.toString(), o.orderNumber]).filter(([, v]) => v));

    res.json({
      status: 'success',
      data: ensureOrderNumberOnReview(review, orderNumberMap)
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Update review status (moderation)
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, moderatedBy, flaggedReason } = req.body;
    
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
    }

    review.status = status;
    review.moderatedBy = moderatedBy;
    review.moderatedAt = new Date();
    
    if (status === 'flagged' && flaggedReason) {
      review.flaggedReason = flaggedReason;
    }

    await review.save();

    res.json({
      status: 'success',
      data: review
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Add response to review
router.post('/:id/response', async (req, res) => {
  try {
    const { text, respondedBy } = req.body;
    
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({
        status: 'error',
        message: 'Review not found'
      });
    }

    review.response = {
      text,
      respondedBy,
      respondedAt: new Date()
    };

    await review.save();

    res.json({
      status: 'success',
      data: review
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get review statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const { restaurantId, days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    let matchQuery = { createdAt: { $gte: startDate } };
    if (restaurantId) matchQuery.restaurantId = restaurantId;

    const stats = await Review.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            status: '$status',
            rating: '$rating'
          },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalReviews = await Review.countDocuments(matchQuery);
    const averageRating = await Review.aggregate([
      { $match: { ...matchQuery, status: 'approved' } },
      { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ]);

    const ratingDistribution = await Review.aggregate([
      { $match: { ...matchQuery, status: 'approved' } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      status: 'success',
      data: {
        totalReviews,
        averageRating: averageRating[0]?.avgRating || 0,
        stats,
        ratingDistribution
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get reviews by restaurant
router.get('/restaurant/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const reviews = await Review.find({ 
      restaurantId, 
      status: 'approved',
      isPublic: true 
    })
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments({ 
      restaurantId, 
      status: 'approved',
      isPublic: true 
    });

    const stats = await Review.getAverageRating(restaurantId);
    const distribution = await Review.getRatingDistribution(restaurantId);

    res.json({
      status: 'success',
      data: {
        reviews,
        stats,
        distribution,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

export default router;
