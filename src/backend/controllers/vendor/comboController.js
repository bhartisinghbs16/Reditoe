import Combo from '../../models/Combo.js';
import Restaurant from '../../models/Restaurant.js';

// GET /api/vendor/combos
export const getVendorCombos = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const restaurant = await Restaurant.findOne({
      owner: userId
    });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    const combos = await Combo.find({
      restaurantId: restaurant._id
    }).sort({ createdAt: -1 });
    return res.json({
      success: true,
      data: { combos }
    });
  } catch (error) {
    console.error('getVendorCombos error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch combos'
    });
  }
};

// POST /api/vendor/combos
export const createCombo = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const restaurant = await Restaurant.findOne({
      owner: userId
    });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    const {
      name, description, image, originalPrice,
      comboPrice, items, addons,
      isBestseller, isPopular
    } = req.body;

    if (!name || !originalPrice || !comboPrice ||
        !items || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Name, prices and items are required'
      });
    }

    const combo = new Combo({
      vendorId: req.user._id,
      restaurantId: restaurant._id,
      name,
      description: description || '',
      image: image || '',
      originalPrice: Number(originalPrice),
      comboPrice: Number(comboPrice),
      items: items || [],
      addons: addons || [],
      isBestseller: isBestseller || false,
      isPopular: isPopular || false,
    });

    await combo.save();
    return res.status(201).json({
      success: true,
      data: { combo }
    });
  } catch (error) {
    console.error('createCombo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create combo'
    });
  }
};

// PATCH /api/vendor/combos/:id
export const updateCombo = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const restaurant = await Restaurant.findOne({
      owner: userId
    });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    const combo = await Combo.findOne({
      _id: req.params.id,
      restaurantId: restaurant._id
    });
    if (!combo) {
      return res.status(404).json({
        success: false,
        message: 'Combo not found'
      });
    }
    const allowedFields = [
      'name', 'description', 'image', 'originalPrice',
      'comboPrice', 'items', 'addons', 'isAvailable',
      'isBestseller', 'isPopular'
    ];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        combo[field] = req.body[field];
      }
    });
    await combo.save();
    return res.json({
      success: true,
      data: { combo }
    });
  } catch (error) {
    console.error('updateCombo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update combo'
    });
  }
};

// DELETE /api/vendor/combos/:id
export const deleteCombo = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    const restaurant = await Restaurant.findOne({
      owner: userId
    });
    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: 'Restaurant not found'
      });
    }
    const combo = await Combo.findOneAndDelete({
      _id: req.params.id,
      restaurantId: restaurant._id
    });
    if (!combo) {
      return res.status(404).json({
        success: false,
        message: 'Combo not found'
      });
    }
    return res.json({
      success: true,
      message: 'Combo deleted successfully'
    });
  } catch (error) {
    console.error('deleteCombo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete combo'
    });
  }
};
