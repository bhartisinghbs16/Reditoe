/**
 * Cuisines/Categories routes - returns unique food categories for filtering
 */
import express from 'express';
import Restaurant from '../models/Restaurant.js';
import FoodItem from '../models/FoodItem.js';

const router = express.Router();

// GET /api/cuisines - Get unique cuisine/category list from restaurants and food items
router.get('/', async (req, res) => {
  try {
    const [restaurantCats, foodCats] = await Promise.all([
      Restaurant.distinct('categories', { status: 'approved', isEnabled: true }),
      FoodItem.distinct('category', { category: { $exists: true, $ne: '' } }),
    ]);
    const all = [...new Set([...restaurantCats, ...foodCats].filter(Boolean))].sort();
    res.json({
      status: 'success',
      data: all,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch cuisines',
    });
  }
});

export default router;
