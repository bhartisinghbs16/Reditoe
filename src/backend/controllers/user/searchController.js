import Restaurant from '../../models/Restaurant.js';
import FoodItem from '../../models/FoodItem.js';
import mongoose from 'mongoose';
import { checkFully } from '../../services/serviceabilityService.js';

// Search restaurants and food items - GET /api/search
export const search = async (req, res) => {
  try {
    const { q, type = 'all', limit = 20, page = 1 } = req.query;
    const userCoordinates = (req.query?.lat && req.query?.lng)
      ? { latitude: Number(req.query.lat), longitude: Number(req.query.lng) }
      : null;
    const customerCity = String(req.query?.city ?? '').trim();
    
    // Parse and validate query parameters
    const query = q ? q.trim() : '';
    const searchType = type; // 'all', 'restaurants', 'food'
    const searchLimit = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const searchPage = Math.max(1, parseInt(page) || 1);
    const skip = (searchPage - 1) * searchLimit;
    
    // If no query, return empty results
    if (!query) {
      return res.status(200).json({
        status: 'success',
        message: 'Please enter a search term',
        data: {
          restaurants: [],
          foodItems: [],
          total: 0
        }
      });
    }
    
    // Create search regex for text search
    const searchRegex = new RegExp(query, 'i');
    
    let restaurants = [];
    let foodItems = [];
    let totalResults = 0;
    let totalRestaurantCount = 0;
    let totalFoodItemCount = 0;
    let notServiceableRestaurants = [];
    
    // Build search conditions (hoisted outside if-blocks to avoid scoping issues)
    const restaurantSearchConditions = [
      { name: searchRegex },
      { categories: { $in: [searchRegex] } },
      { description: searchRegex },
      { 'address.city': searchRegex },
      { 'address.street': searchRegex }
    ];
    if (mongoose.Types.ObjectId.isValid(query)) {
      restaurantSearchConditions.push({ _id: new mongoose.Types.ObjectId(query) });
    }
    
    const foodSearchConditions = [
      { name: searchRegex },
      { category: searchRegex },
      { description: searchRegex }
    ];
    if (mongoose.Types.ObjectId.isValid(query)) {
      foodSearchConditions.push({ _id: new mongoose.Types.ObjectId(query) });
    }
    
    // Get approved restaurant IDs (needed for food search and counts)
    const approvedRestaurantDocs = await Restaurant.find({
      status: 'approved',
      isEnabled: true
    }).select('_id name image rating isOpen address isApproved isActive status deliveryRadius').lean();
    const serviceableRestaurantIds = new Set();
    for (const restaurant of approvedRestaurantDocs) {
      const reach = await checkFully({ restaurant, customer: userCoordinates });
      if (reach.serviceable) serviceableRestaurantIds.add(String(restaurant._id));
    }
    const restaurantIds = approvedRestaurantDocs
      .filter(r => serviceableRestaurantIds.has(String(r._id)))
      .map(r => r._id);
    
    // Search restaurants (only approved and enabled)
    if (searchType === 'all' || searchType === 'restaurants') {
      const restaurantMatches = await Restaurant.find({
        $and: [
          { status: 'approved' },
          { isEnabled: true },
          { $or: restaurantSearchConditions }
        ]
      })
      .select('name image rating deliveryTime deliveryFee categories description address isOpen isApproved isActive status deliveryRadius')
      .sort({ isFeatured: -1, rating: -1 })
      .lean();

      const serviceableMatches = [];
      for (const restaurant of restaurantMatches) {
        const reach = await checkFully({ restaurant, customer: userCoordinates });
        if (reach.serviceable) {
          serviceableMatches.push(restaurant);
        } else if (customerCity && restaurant?.address?.city &&
          restaurant.address.city.trim().toLowerCase() === customerCity.toLowerCase() &&
          reach.reason === 'outside_radius') {
          // Same-city matches beyond the 10 km boundary are not results; the
          // client may use this only to explain "Not serviceable". Restaurants
          // in other cities are intentionally omitted with no explanation.
          notServiceableRestaurants.push({
            name: restaurant.name,
            distanceKm: reach.distanceKm,
            message: 'Not serviceable from your current delivery location.',
          });
        }
      }
      totalRestaurantCount = serviceableMatches.length;
      restaurants = serviceableMatches.slice(skip, skip + searchLimit);
    }
    
    // Search food items (from approved restaurants only)
    if (searchType === 'all' || searchType === 'food') {
      foodItems = await FoodItem.find({
        $and: [
          { restaurantId: { $in: restaurantIds } },
          { isAvailable: true },
          { $or: foodSearchConditions }
        ]
      })
      .populate('restaurantId', 'name image rating isOpen')
      .select('name image price category description restaurantId rating')
      .sort({ rating: -1, name: 1 })
      .limit(searchLimit)
      .skip(skip)
      .lean();
      
      totalFoodItemCount = await FoodItem.countDocuments({
        $and: [
          { restaurantId: { $in: restaurantIds } },
          { isAvailable: true },
          { $or: foodSearchConditions }
        ]
      });
    }
    
    totalResults = totalRestaurantCount + totalFoodItemCount;
    const totalPages = Math.ceil(totalResults / searchLimit);
    
    // Map food items to include restaurant name
    const mappedRestaurants = restaurants.map((r) => ({
      ...r,
      isOpen: r?.isOpen === true,
      isOrderable: r?.isOpen === true,
    }));

    const mappedFoodItems = foodItems.map(item => ({
      _id: item._id,
      name: item.name,
      image: item.image,
      price: item.price,
      category: item.category,
      description: item.description,
      rating: item.rating || 0,
      restaurantName: item.restaurantId?.name || 'Restaurant',
      restaurantId: item.restaurantId?._id || null,
      restaurantImage: item.restaurantId?.image || null,
      restaurantRating: item.restaurantId?.rating || 0,
      restaurantIsOpen: item.restaurantId?.isOpen === true,
    }));
    
    res.status(200).json({
      status: 'success',
      message: `Found ${totalResults} results for "${query}"`,
      data: {
        restaurants: mappedRestaurants,
        foodItems: mappedFoodItems,
        pagination: {
          currentPage: searchPage,
          totalPages: totalPages,
          totalResults: totalResults,
          resultsPerPage: searchLimit,
          hasNextPage: searchPage < totalPages,
          hasPrevPage: searchPage > 1,
          restaurantCounts: {
            current: mappedRestaurants.length,
            total: totalRestaurantCount
          },
          foodItemCounts: {
            current: mappedFoodItems.length,
            total: totalFoodItemCount
          }
        },
        query,
        notServiceableRestaurants: notServiceableRestaurants.slice(0, 3)
      }
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Search failed. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Search suggestions - GET /api/search/suggestions
export const getSearchSuggestions = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    const query = q ? q.trim() : '';
    const suggestionLimit = Math.min(20, Math.max(1, parseInt(limit) || 10));
    
    if (!query || query.length < 2) {
      return res.status(200).json({
        status: 'success',
        data: {
          suggestions: []
        }
      });
    }
    
    const searchRegex = new RegExp(`^${query}`, 'i');
    
    // Get restaurant name suggestions
    const restaurantSuggestions = await Restaurant.find({
      $and: [
        { status: 'approved' },
        { isEnabled: true },
        { name: searchRegex }
      ]
    })
    .select('name')
    .limit(suggestionLimit)
    .lean();
    
    // Get food item name suggestions
    const approvedRestaurantIds = await Restaurant.find({
      status: 'approved',
      isEnabled: true
    }).select('_id').lean();
    
    const foodSuggestions = await FoodItem.find({
      $and: [
        { restaurantId: { $in: approvedRestaurantIds.map(r => r._id) } },
        { isAvailable: true },
        { name: searchRegex }
      ]
    })
    .select('name')
    .limit(suggestionLimit)
    .lean();
    
    // Combine and deduplicate suggestions
    const allSuggestions = [
      ...restaurantSuggestions.map(r => ({ type: 'restaurant', name: r.name })),
      ...foodSuggestions.map(f => ({ type: 'food', name: f.name }))
    ];
    
    // Remove duplicates and limit results
    const uniqueSuggestions = allSuggestions
      .filter((suggestion, index, self) => 
        index === self.findIndex(s => s.name === suggestion.name)
      )
      .slice(0, suggestionLimit);
    
    res.status(200).json({
      status: 'success',
      data: {
        suggestions: uniqueSuggestions
      }
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to get suggestions. Please try again.'
    });
  }
};
