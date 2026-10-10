import express from 'express';
import { getRestaurants, getFoodCategories, getRestaurantById, getRestaurantMenu, getRestaurantCombos, getRestaurantIdFromFoodItem, getPopularFoodItems } from '../controllers/user/restaurantController.js';

const router = express.Router();

// GET /api/restaurants - Fetch all restaurants for Home screen
router.get('/', getRestaurants);

// GET /api/restaurants/food-categories - the kinds of food actually on sale.
// Before /:id, or "food-categories" is read as a restaurant id.
router.get('/food-categories', getFoodCategories);

// GET /api/restaurants/food-items/popular - Get popular/featured food items (must be before /:id routes)
router.get('/food-items/popular', getPopularFoodItems);

// GET /api/restaurants/food-items/:id/restaurant - Get restaurantId from foodItemId (must be before /:id route)
router.get('/food-items/:id/restaurant', getRestaurantIdFromFoodItem);

// GET /api/restaurants/:id/menu - Fetch items and their addons for Menu screen
router.get('/:id/menu', getRestaurantMenu);

// GET /api/restaurants/:id/combos - Fetch available combo meals
router.get('/:id/combos', getRestaurantCombos);

// GET /api/restaurants/:id - Get restaurant by ID (for backward compatibility)
router.get('/:id', getRestaurantById);

export default router;
