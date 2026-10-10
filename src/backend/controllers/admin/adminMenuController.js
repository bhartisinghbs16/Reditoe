/**
 * Admin menu (food items) controller. CRUD on FoodItem collection.
 * Does NOT modify vendorController or /api/vendor/menu. Admin-only.
 */
import FoodItem from '../../models/FoodItem.js';
import { uploadedFileUrl } from '../../config/s3Upload.js';
import Restaurant from '../../models/Restaurant.js';
import mongoose from 'mongoose';

/**
 * Format food item for admin response (align with FoodItem schema; no extra fields).
 */
function formatItem(doc) {
  const d = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const rest = d.restaurantId || {};
  return {
    _id: d._id,
    id: d._id?.toString?.() || d.id,
    name: d.name ?? '',
    description: d.description ?? null,
    image: d.image || null,
    category: d.category ?? '',
    price: Number(d.price) || 0,
    isAvailable: d.isAvailable !== false,
    preparationTime: d.preparationTime ?? null,
    addons: d.addons || [],
    restaurantId: rest._id?.toString?.() || d.restaurantId,
    restaurant: {
      id: rest._id?.toString?.() || rest.id,
      name: rest.name ?? '',
    },
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}


export const uploadMenuItemImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'error',
        message: 'No image uploaded',
      });
    }

    // S3 sets `location`; disk storage sets `filename` — the helper covers both,
    // so an upload works whether or not S3 credentials are present.
    // Memory fallback will have empty location
    const imageUrl = uploadedFileUrl(req.file);

    if (!imageUrl) {
      return res.status(500).json({
        status: 'error',
        message: 'Image upload failed — storage not configured',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        imageUrl,
      },
    });
  } catch (error) {
    console.error('Menu image upload error:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Upload failed',
    });
  }
};
/**
 * GET /admin/menu-items - List all food items (paginated, filterable)
 */
export const getMenuItems = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;
    const restaurantId = req.query.restaurantId;
    const category = req.query.category;
    const isAvailable = req.query.isAvailable;

    const filter = {};
    if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
      filter.restaurantId = new mongoose.Types.ObjectId(restaurantId);
    }
    if (category && category !== 'all') filter.category = category;
    if (isAvailable !== undefined && isAvailable !== '') {
      filter.isAvailable = isAvailable === 'true';
    }

    const [items, total] = await Promise.all([
      FoodItem.find(filter)
        .populate('restaurantId', 'name image')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FoodItem.countDocuments(filter),
    ]);

    const menuItems = items.map(formatItem);

    res.status(200).json({
      status: 'success',
      data: { menuItems },
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch menu items',
    });
  }
};

/**
 * GET /admin/menu-items/:id - Get one menu item
 */
export const getMenuItemById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid menu item ID',
      });
    }

    const item = await FoodItem.findById(id)
      .populate('restaurantId', 'name image')
      .lean();

    if (!item) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu item not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { menuItem: formatItem(item) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch menu item',
    });
  }
};

/**
 * POST /admin/menu-items - Create new food item
 */
export const createMenuItem = async (req, res) => {
  try {
    const { name, price, description, image, restaurantId, category, isAvailable, preparationTime, addons } = req.body;

    // Debug logging to track incoming price
    console.log("=== CREATE MENU ITEM PRICE DEBUG ===");
    console.log("Incoming price:", price);
    console.log("Price type:", typeof price);
    console.log("====================================");

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        status: 'error',
        message: 'Name is required',
      });
    }
    const priceNum = parseFloat(price);
    if (price === undefined || price === null || isNaN(priceNum) || priceNum < 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid price (>= 0) is required',
      });
    }
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Valid restaurant is required',
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(400).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    const item = await FoodItem.create({
      name: name.trim(),
      price: priceNum,
      description: (description && typeof description === 'string') ? description.trim() : '',
      image: image || '',
      restaurantId: new mongoose.Types.ObjectId(restaurantId),
      category: (category && typeof category === 'string') ? category.trim() : '',
      isAvailable: isAvailable !== false,
      preparationTime: preparationTime != null ? Number(preparationTime) : undefined,
      addons: Array.isArray(addons) ? addons : [],
    });

    // Debug logging to track saved price
    console.log("Saved item price:", item.price);
    console.log("====================================");

    const populated = await FoodItem.findById(item._id).populate('restaurantId', 'name image').lean();

    res.status(201).json({
      status: 'success',
      message: 'Menu item created successfully',
      data: { menuItem: formatItem(populated) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create menu item',
    });
  }
};

/**
 * PUT /admin/menu-items/:id - Update menu item (full/partial)
 */
export const updateMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, description, image, restaurantId, category, isAvailable, preparationTime, addons } = req.body;

    // Debug logging to track incoming price
    if (price !== undefined) {
      console.log("=== UPDATE MENU ITEM PRICE DEBUG ===");
      console.log("Item ID:", id);
      console.log("Incoming price:", price);
      console.log("Price type:", typeof price);
      console.log("====================================");
    }

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid menu item ID',
      });
    }

    const item = await FoodItem.findById(id);
    if (!item) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu item not found',
      });
    }

    if (name !== undefined) item.name = typeof name === 'string' ? name.trim() : item.name;
    if (price !== undefined) {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Price must be a non-negative number',
        });
      }
      item.price = priceNum;
      console.log("Updated item price:", item.price);
    }
    if (description !== undefined) item.description = typeof description === 'string' ? description.trim() : '';
    if (image !== undefined) item.image = image || '';
    if (category !== undefined) item.category = typeof category === 'string' ? category.trim() : '';
    if (isAvailable !== undefined) item.isAvailable = Boolean(isAvailable);
    if (restaurantId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid restaurant ID',
        });
      }
      const rest = await Restaurant.findById(restaurantId);
      if (!rest) {
        return res.status(400).json({
          status: 'error',
          message: 'Restaurant not found',
        });
      }
      item.restaurantId = new mongoose.Types.ObjectId(restaurantId);
    }
    if (preparationTime !== undefined) item.preparationTime = preparationTime != null ? Number(preparationTime) : undefined;
    if (addons !== undefined) item.addons = Array.isArray(addons) ? addons : item.addons;

    await item.save();

    const populated = await FoodItem.findById(item._id).populate('restaurantId', 'name image').lean();

    res.status(200).json({
      status: 'success',
      message: 'Menu item updated successfully',
      data: { menuItem: formatItem(populated) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update menu item',
    });
  }
};

/**
 * PATCH /admin/menu-items/:id/status - Toggle isAvailable (enable/disable)
 */
export const updateMenuItemStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isAvailable } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid menu item ID',
      });
    }

    if (typeof isAvailable !== 'boolean') {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide isAvailable (boolean)',
      });
    }

    const item = await FoodItem.findByIdAndUpdate(
      id,
      { $set: { isAvailable } },
      { new: true, runValidators: true }
    )
      .populate('restaurantId', 'name image')
      .lean();

    if (!item) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu item not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { menuItem: formatItem(item) },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update menu item status',
    });
  }
};

/**
 * DELETE /admin/menu-items/:id - Delete menu item (hard delete)
 */
export const deleteMenuItem = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid menu item ID',
      });
    }

    const item = await FoodItem.findByIdAndDelete(id);
    if (!item) {
      return res.status(404).json({
        status: 'error',
        message: 'Menu item not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Menu item deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete menu item',
    });
  }
};

