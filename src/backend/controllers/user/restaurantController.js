import Restaurant from '../../models/Restaurant.js';
import { checkFully } from '../../services/serviceabilityService.js';
import FoodItem from '../../models/FoodItem.js';
import Order from '../../models/Order.js';
import Combo from '../../models/Combo.js';
import VendorVisibilityMiddleware from '../../middleware/vendorVisibilityMiddleware.js';
import mongoose from 'mongoose';
import { computeDynamicEta } from '../../services/etaService.js';

/** A customer's search text is not a pattern; treat it as literal. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getRestaurantAvailabilityFilter = () => ({
  $and: [
    { status: 'approved' },
    { isEnabled: true },
    { $or: [{ isApproved: true }, { isApproved: { $exists: false } }] },
    { $or: [{ isActive: true }, { isActive: { $exists: false } }] },
  ],
});

const isRestaurantAvailable = (restaurant) => {
  const approvedStatus = restaurant.status === 'approved';
  const enabled = restaurant.isEnabled === true;
  const approved = restaurant.isApproved !== false;
  const active = restaurant.isActive !== false;
  return approvedStatus && enabled && approved && active;
};

// Get all restaurants - GET /api/restaurants
/**
 * GET /api/food-categories
 *
 * The kinds of food actually on sale, for the row the home screen filters by.
 *
 * Derived from the menus rather than kept as a separate list, because a fixed
 * list drifts: the app used to show Pizza, Burgers, Biryani and Chinese from a
 * file in the bundle, so tapping one could offer categories nobody sells and
 * miss ones they do. Every category here has at least one item behind it.
 *
 * Only orderable restaurants count, so a category never leads to an empty
 * list because its one seller is closed or unapproved.
 */
/**
 * The pictures a restaurant card shows: the restaurant's own, then its food.
 *
 * The client asked for five images per card - the photo uploaded at
 * registration, followed by four dishes, chosen by what sells. Ranked by how
 * often each item has actually been ordered, falling back to the menu where
 * there is no order history yet, so a new restaurant still gets a full card
 * and the pictures improve on their own as orders arrive.
 *
 * Only delivered and in-flight orders count; a cancelled order is not
 * evidence that anybody wanted the dish.
 */
async function galleryFor(restaurantIds) {
  if (restaurantIds.length === 0) return new Map();

  const [sold, menu] = await Promise.all([
    Order.aggregate([
      {
        $match: {
          restaurantId: { $in: restaurantIds },
          status: { $nin: ['Cancelled', 'RiderRejected', 'Payment Pending'] },
        },
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: { restaurant: '$restaurantId', item: '$items.foodItemId' },
          sold: { $sum: '$items.quantity' },
        },
      },
      { $sort: { sold: -1 } },
    ]),
    FoodItem.find({
      restaurantId: { $in: restaurantIds },
      isAvailable: { $ne: false },
      image: { $nin: [null, ''] },
    })
      .select('restaurantId name image createdAt')
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const imageById = new Map(menu.map((item) => [String(item._id), item.image]));
  const byRestaurant = new Map();

  // What sells, in order.
  for (const row of sold) {
    const key = String(row._id.restaurant);
    const image = imageById.get(String(row._id.item));
    if (!image) continue;
    const list = byRestaurant.get(key) ?? [];
    if (!list.includes(image)) list.push(image);
    byRestaurant.set(key, list);
  }

  // Topped up from the menu where the history runs out.
  for (const item of menu) {
    const key = String(item.restaurantId);
    const list = byRestaurant.get(key) ?? [];
    if (list.length >= 4) continue;
    if (!list.includes(item.image)) list.push(item.image);
    byRestaurant.set(key, list);
  }

  for (const [key, list] of byRestaurant) byRestaurant.set(key, list.slice(0, 4));
  return byRestaurant;
}

export const getFoodCategories = async (_req, res) => {
  try {
    const openIds = await Restaurant.find(getRestaurantAvailabilityFilter()).distinct('_id');
    if (openIds.length === 0) {
      return res.status(200).json({ status: 'success', data: { categories: [] } });
    }

    const rows = await FoodItem.aggregate([
      {
        $match: {
          restaurantId: { $in: openIds },
          isAvailable: { $ne: false },
          category: { $nin: [null, ''] },
        },
      },
      {
        $group: {
          // Case and spacing vary between vendors typing the same word.
          _id: { $toLower: { $trim: { input: '$category' } } },
          label: { $first: '$category' },
          items: { $sum: 1 },
          restaurants: { $addToSet: '$restaurantId' },
          /*
           * Every picture in the category, not the first dish's.
           *
           * `$first` took whatever happened to sort first, and a vendor who
           * had not uploaded a photo for that one dish left the whole
           * category with no image — the customer's cuisine row then drew a
           * plain icon beside categories that had plenty of photos. Deduped,
           * so this stays small however many dishes share a stock picture.
           */
          images: { $addToSet: '$image' },
        },
      },
      { $sort: { restaurants: -1, items: -1 } },
    ]);

    return res.status(200).json({
      status: 'success',
      data: {
        categories: rows.map((row) => ({
          id: row._id,
          name: row.label,
          items: row.items,
          restaurants: row.restaurants.length,
          image:
            (row.images || []).find(
              (url) => typeof url === 'string' && url.trim().length > 0
            ) || null,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: error.message });
  }
};

export const getRestaurants = async (req, res) => {
  try {
    const userCoordinates = (req.query?.lat && req.query?.lng)
      ? { latitude: Number(req.query.lat), longitude: Number(req.query.lng) }
      : null;
    // CRITICAL: Auto-correct inconsistent states before listing
    // This ensures vendors appear immediately after approval
    await VendorVisibilityMiddleware.bulkFixInconsistentStates();
    
    /*
     * A category narrows the list to restaurants that actually sell that kind
     * of food - matched on their menu items, not on the cuisine tags of the
     * restaurant, because a place tagged "North Indian" may well sell burgers
     * and a customer asking for burgers wants to see it.
     */
    const category = String(req.query?.category ?? '').trim();
    const filter = { ...getRestaurantAvailabilityFilter() };

    if (category) {
      const matching = await FoodItem.find({
        isAvailable: { $ne: false },
        $or: [
          { category: new RegExp(`^${escapeRegex(category)}$`, 'i') },
          { name: new RegExp(escapeRegex(category), 'i') },
        ],
      }).distinct('restaurantId');
      filter._id = { $in: matching };
    }

    const restaurants = await Restaurant.find(filter)
      .select('-owner -__v')
      .sort({ isFeatured: -1, rating: -1, createdAt: -1 });

    // Serviceability is a discovery rule, not merely a badge. Non-serviceable
    // restaurants must never reach the customer catalogue, otherwise an
    // out-of-state/long-distance restaurant can still appear in search/home.
    const restaurantsWithVisibility = VendorVisibilityMiddleware.addVisibilityStatus(restaurants);
    const reachable = [];
    const reachById = new Map();
    for (const restaurant of restaurantsWithVisibility) {
      const reach = await checkFully({ restaurant, customer: userCoordinates });
      reachById.set(String(restaurant._id), reach);
      if (reach.serviceable) reachable.push(restaurant);
    }

    console.log('🍽️ Serviceable restaurants returned:', reachable.length, 'of', restaurants.length);

    const gallery = await galleryFor(reachable.map((entry) => entry._id));

    const mappedRestaurants = await Promise.all(reachable.map(async (restaurant) => {
      const eta = await computeDynamicEta({ restaurant, userCoordinates });
      const reach = reachById.get(String(restaurant._id));
      return {
        _id: restaurant._id,
        name: restaurant.name,
        image: restaurant.image,
        /*
         * The card's carousel: the restaurant's own photo first, then up to
         * four dishes. Absent entries are dropped rather than padded, so a
         * card never shows a blank frame.
         */
        gallery: [
          restaurant.image,
          ...(gallery.get(String(restaurant._id)) ?? []),
        ].filter(Boolean),
        rating: restaurant.rating,
        deliveryTime: eta.deliveryTime || restaurant.deliveryTime,
        estimatedDeliveryMinutes: eta.estimatedDeliveryMinutes ?? restaurant.estimatedDeliveryMinutes,
        etaSource: eta.etaSource,
        etaBreakdown: eta.etaBreakdown,
        currentPrepTimeMinutes: restaurant.currentPrepTimeMinutes,
        deliveryBufferMinutes: restaurant.deliveryBufferMinutes,
        deliveryFee: restaurant.deliveryFee,
        categories: restaurant.categories,
        isFeatured: restaurant.isFeatured,
        address: restaurant.address,
        phone: restaurant.phone,
        description: restaurant.description,
        isOpen: restaurant.isOpen === true,
        /**
         * Orderable now means three things at once: the kitchen is open, the
         * vendor is approved and visible, and this customer is inside the
         * distance that particular vendor delivers. It used to mean only the
         * first two, which is why restaurants in other towns were offered.
         */
        isOrderable:
          restaurant.isOpen === true && restaurant.isVisible && reach.serviceable,
        isVisible: restaurant.isVisible,
        visibilityReason: restaurant.visibilityReason,

        // The listing shows unreachable restaurants rather than hiding them,
        // with the reason, so a customer can see the place exists and why
        // they cannot order from it today.
        serviceable: reach.serviceable,
        serviceabilityReason: reach.reason,
        serviceabilityMessage: reach.message,
        deliveryRadiusKm: reach.radiusKm,
        distanceKm: reach.distanceKm,
      };
    }));

    res.status(200).json({
      status: 'success',
      results: mappedRestaurants.length,
      data: {
        restaurants: mappedRestaurants,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Get restaurant menu - GET /api/restaurants/:id/menu
export const getRestaurantMenu = async (req, res) => {
  try {
    const { id } = req.params;
    const userCoordinates = (req.query?.lat && req.query?.lng)
      ? { latitude: Number(req.query.lat), longitude: Number(req.query.lng) }
      : null;

    // Enhanced ObjectId validation with safe casting and multiple fallback strategies
    let restaurant;
    
    // Strategy 1: Try MongoDB ObjectId lookup with safe validation
    if (id && mongoose.Types.ObjectId.isValid(id)) {
      try {
        restaurant = await Restaurant.findById(id);
      } catch (dbError) {
      }
    }
    
    // Strategy 2: Try string ID lookup (for non-ObjectID formats)
    if (!restaurant && id) {
      try {
        restaurant = await Restaurant.findOne({ 
          $or: [
            { _id: id },
            { name: id },
            { customId: id }
          ]
        });
      } catch (dbError) {
      }
    }
    
    // Strategy 3: If still not found, try by name (case-insensitive)
    if (!restaurant && id && typeof id === 'string') {
      try {
        restaurant = await Restaurant.findOne({ 
          name: { $regex: new RegExp(`^${id}$`, 'i') }
        });
      } catch (dbError) {
      }
    }
    
    // If all strategies fail, return a helpful error
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found or unavailable',
        code: 'RESTAURANT_NOT_FOUND',
        suggestion: 'Please check the restaurant ID or browse available restaurants',
        searchId: id
      });
    }

    // Use unified visibility logic to check if restaurant is available
    if (!isRestaurantAvailable(restaurant)) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not available',
        code: 'RESTAURANT_NOT_AVAILABLE',
        suggestion: 'This restaurant is not currently available for ordering',
        isApproved: restaurant.isApproved,
        isActive: restaurant.isActive,
      });
    }

    const menuReach = await checkFully({ restaurant, customer: userCoordinates });
    if (!menuReach.serviceable) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant is outside your delivery area',
        code: 'RESTAURANT_NOT_SERVICEABLE',
        serviceabilityReason: menuReach.reason,
        serviceabilityMessage: menuReach.message,
      });
    }

    // Get all food items with their addons for this restaurant
    const foodItems = await FoodItem.find({ 
      restaurantId: restaurant._id, // Use restaurant._id for consistency
      isAvailable: true 
    })
      .select('-__v')
      .sort({ category: 1, name: 1 });

    // Debug logging to track raw DB prices
    console.log("=== BACKEND PRICE DEBUG ===");
    console.log("Restaurant:", restaurant.name);
    console.log("Food Items Count:", foodItems.length);
    foodItems.forEach(item => {
      console.log("🍽️ RAW DB ITEM:", {
        name: item.name,
        price: item.price,
        priceType: typeof item.price,
        _id: item._id
      });
    });
    console.log("=========================");

    // Add visibility status to restaurant response
    const restaurantWithVisibility = VendorVisibilityMiddleware.validateForListing(restaurant);

    const eta = await computeDynamicEta({ restaurant: restaurantWithVisibility, userCoordinates });

    res.status(200).json({
      status: 'success',
      data: {
        restaurant: {
          _id: restaurantWithVisibility._id,
          name: restaurantWithVisibility.name,
          image: restaurantWithVisibility.image,
          rating: restaurantWithVisibility.rating,
          deliveryTime: eta.deliveryTime || restaurantWithVisibility.deliveryTime,
          estimatedDeliveryMinutes: eta.estimatedDeliveryMinutes ?? restaurantWithVisibility.estimatedDeliveryMinutes,
          etaSource: eta.etaSource,
          etaBreakdown: eta.etaBreakdown,
          currentPrepTimeMinutes: restaurantWithVisibility.currentPrepTimeMinutes,
          deliveryBufferMinutes: restaurantWithVisibility.deliveryBufferMinutes,
          deliveryFee: restaurantWithVisibility.deliveryFee,
          isOpen: restaurantWithVisibility.isOpen === true,
          isOrderable: restaurantWithVisibility.isOpen === true && restaurantWithVisibility.isVisible,
          isVisible: restaurantWithVisibility.isVisible,
          visibilityReason: restaurantWithVisibility.visibilityReason,
        },
        menu: foodItems.map((item) => ({
          _id: item._id,
          name: item.name,
          price: item.price,
          description: item.description || '',
          image: item.image || '',
          category: item.category || '',
          // An add-on switched off by the vendor is not on the menu. It was
          // sent regardless, so switching one off changed nothing a customer
          // could see and they could still order it.
          addons: (item.addons || []).filter((addon) => addon.isAvailable !== false),
          modifierGroups: item.modifierGroups || [],
          // The manual switch and the schedule together. A dish limited to
          // specific hours or days showed as available outside them, and the
          // order was then refused at checkout.
          isAvailable: item.isOrderableAt ? item.isOrderableAt() : item.isAvailable !== false,
          preparationTime: item.preparationTime || 0,
          foodType: item.foodType || 'veg',
          isVeg: (item.foodType || 'veg') === 'veg',
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

export const getRestaurantCombos = async (req, res) => {
  try {
    const { id } = req.params;
    const combos = await Combo.find({
      restaurantId: id,
      isAvailable: true,
    }).lean();

    return res.status(200).json({
      status: 'success',
      data: {
        combos: combos.map(combo => ({
          _id: combo._id,
          name: combo.name,
          description: combo.description,
          image: combo.image,
          originalPrice: combo.originalPrice,
          comboPrice: combo.comboPrice,
          items: combo.items,
          addons: combo.addons,
          isBestseller: combo.isBestseller,
          isPopular: combo.isPopular,
          isAvailable: combo.isAvailable,
        })),
      },
    });
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: error.message,
    });
  }
};

// Get restaurant by ID - GET /api/restaurants/:id
export const getRestaurantById = async (req, res) => {
  try {
    const { id } = req.params;
    const userCoordinates = (req.query?.lat && req.query?.lng)
      ? { latitude: Number(req.query.lat), longitude: Number(req.query.lng) }
      : null;

    // Enhanced ObjectId validation with multiple fallback strategies
    let restaurant;
    
    // Strategy 1: Try MongoDB ObjectId lookup
    if (id && /^[0-9a-fA-F]{24}$/.test(id)) {
      try {
        restaurant = await Restaurant.findById(id);
      } catch (dbError) {
      }
    }
    
    // Strategy 2: Try string ID lookup (for non-ObjectID formats)
    if (!restaurant && id) {
      try {
        restaurant = await Restaurant.findOne({ 
          $or: [
            { _id: id },
            { name: id },
            { customId: id }
          ]
        });
      } catch (dbError) {
      }
    }
    
    // Strategy 3: If still not found, try by name (case-insensitive)
    if (!restaurant && id && typeof id === 'string') {
      try {
        restaurant = await Restaurant.findOne({ 
          name: { $regex: new RegExp(`^${id}$`, 'i') }
        });
      } catch (dbError) {
      }
    }
    
    // If all strategies fail, return a helpful error
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found or unavailable',
        code: 'RESTAURANT_NOT_FOUND',
        suggestion: 'Please check the restaurant ID or browse available restaurants',
        searchId: id
      });
    }

    if (!isRestaurantAvailable(restaurant)) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not available',
        code: 'RESTAURANT_NOT_AVAILABLE',
        suggestion: 'This restaurant is not currently available for ordering',
        isApproved: restaurant.isApproved,
        isActive: restaurant.isActive,
      });
    }

    const detailReach = await checkFully({ restaurant, customer: userCoordinates });
    if (!detailReach.serviceable) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant is outside your delivery area',
        code: 'RESTAURANT_NOT_SERVICEABLE',
        serviceabilityReason: detailReach.reason,
        serviceabilityMessage: detailReach.message,
      });
    }

    // Get all food items for this restaurant
    const foodItems = await FoodItem.find({ restaurantId: id, isAvailable: true })
      .select('-__v')
      .sort({ name: 1 });

    const eta = await computeDynamicEta({ restaurant, userCoordinates });

    res.status(200).json({
      status: 'success',
      data: {
        restaurant: {
          ...restaurant.toObject(),
          deliveryTime: eta.deliveryTime || restaurant.deliveryTime,
          estimatedDeliveryMinutes: eta.estimatedDeliveryMinutes ?? restaurant.estimatedDeliveryMinutes,
          etaSource: eta.etaSource,
          etaBreakdown: eta.etaBreakdown,
          isOpen: restaurant.isOpen === true,
          isOrderable: restaurant.isOpen === true && isRestaurantAvailable(restaurant),
          foodItems,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

// Get restaurantId from foodItemId - GET /api/food-items/:id/restaurant
export const getRestaurantIdFromFoodItem = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate MongoDB ObjectId format
    if (!id || !/^[0-9a-fA-F]{24}$/.test(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid food item ID format',
      });
    }

    const foodItem = await FoodItem.findById(id).select('restaurantId');
    
    if (!foodItem) {
      return res.status(404).json({
        status: 'error',
        message: 'Food item not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        restaurantId: foodItem.restaurantId,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};

// Get popular/featured food items - GET /api/food-items/popular
export const getPopularFoodItems = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    // Get popular food items from featured restaurants
    const featuredRestaurants = await Restaurant.find({
      ...getRestaurantAvailabilityFilter(),
      isFeatured: true
    }).select('_id');
    
    const restaurantIds = featuredRestaurants.map(r => r._id);
    
    // Get food items from featured restaurants, sorted by rating
    // If no featured restaurants, get from all approved restaurants
    const searchRestaurantIds = restaurantIds.length > 0
      ? restaurantIds
      : (await Restaurant.find(getRestaurantAvailabilityFilter()).select('_id')).map(r => r._id);
    
    const popularItems = await FoodItem.find({
      restaurantId: { $in: searchRestaurantIds },
      isAvailable: true,
    })
      .populate('restaurantId', 'name')
      .select('-__v')
      .sort({ rating: -1, createdAt: -1 })
      .limit(limit);

    // Map to frontend format
    const mappedItems = popularItems.map(item => ({
      _id: item._id,
      name: item.name,
      image: item.image,
      price: item.price,
      rating: item.rating || 0,
      reviewCount: 0, // Can be added later if you track reviews
      description: item.description || '',
      category: item.category || 'Food',
      restaurantName: item.restaurantId?.name || 'Restaurant',
      restaurantId: item.restaurantId?._id || null,
    }));

    res.status(200).json({
      status: 'success',
      results: mappedItems.length,
      data: {
        items: mappedItems,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error',
    });
  }
};
