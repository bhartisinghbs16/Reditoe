import express from 'express';
import mongoose from 'mongoose';
import Review from '../models/Review.js';
import Order from '../models/Order.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// Create review - POST /api/reviews (protected, user must have completed the order)
router.post('/', protect, async (req, res) => {
  try {
    const { orderId, restaurantId, rating, title, comment, foodRating, serviceRating, deliveryRating } = req.body;
    if (!orderId || !restaurantId || !rating || !title || !comment) {
      return res.status(400).json({
        status: 'error',
        message: 'orderId, restaurantId, rating, title, and comment are required',
      });
    }
    const order = await Order.findOne({
      _id: orderId,
      userId: req.user.id,
      status: 'Delivered',
    });
    if (!order) {
      return res.status(403).json({
        status: 'error',
        message: 'Order not found or you can only review delivered orders you placed',
      });
    }
    const existing = await Review.findOne({ orderId, userId: req.user.id });
    if (existing) {
      return res.status(400).json({
        status: 'error',
        message: 'You have already reviewed this order',
      });
    }
    const review = await Review.create({
      orderId,
      userId: req.user.id,
      restaurantId,
      rating: Math.min(5, Math.max(1, Number(rating))),
      title: String(title).trim().slice(0, 100),
      comment: String(comment).trim().slice(0, 1000),
      foodRating: foodRating ? Math.min(5, Math.max(1, Number(foodRating))) : undefined,
      serviceRating: serviceRating ? Math.min(5, Math.max(1, Number(serviceRating))) : undefined,
      deliveryRating: deliveryRating ? Math.min(5, Math.max(1, Number(deliveryRating))) : undefined,
      status: 'pending',
    });
    res.status(201).json({
      status: 'success',
      data: review,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create review',
    });
  }
});

// Public reviews endpoint (no auth required)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { rating, restaurantId, status = 'approved' } = req.query;

    let query = { status };
    if (rating) query.rating = parseInt(rating);
    if (restaurantId) query.restaurantId = restaurantId;

    const reviews = await Review.find(query)
      .populate('userId', 'name')
      .populate('restaurantId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Review.countDocuments(query);

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

// Public reviews statistics
router.get('/stats', async (req, res) => {
  try {
    const { restaurantId } = req.query;
    const filter = { status: 'approved' };
    if (restaurantId && mongoose.Types.ObjectId.isValid(String(restaurantId))) {
      filter.restaurantId = new mongoose.Types.ObjectId(String(restaurantId));
    }

    const totalReviews = await Review.countDocuments(filter);
    const averageRating = await Review.aggregate([
      { $match: filter },
      { $group: { _id: null, avgRating: { $avg: '$rating' } } }
    ]);

    const ratingDistribution = await Review.aggregate([
      { $match: filter },
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

export default router;
