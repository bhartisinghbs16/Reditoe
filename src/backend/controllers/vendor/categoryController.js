import Category from '../../models/Category.js';
import FoodItem from '../../models/FoodItem.js';

const getRestaurantId = (req) => (
  req.restaurantId ||
  req.vendor?.restaurantId ||
  req.user?.restaurantId
);

// Get all categories for vendor
export const getCategories = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);

    const categories = await Category.find({
      restaurantId,
    }).sort({ sortOrder: 1, name: 1 });

    const foodItemCategories = await FoodItem.distinct(
      'category',
      { restaurantId }
    );

    const existingCatNames = categories.map((c) => c.name);
    const orphanCategories = foodItemCategories
      .filter((c) => c && !existingCatNames.includes(c))
      .map(async (catName) => {
        const count = await FoodItem.countDocuments({
          restaurantId,
          category: catName,
        });
        return {
          _id: null,
          name: catName,
          image: '',
          isActive: true,
          sortOrder: 999,
          itemCount: count,
          isOrphan: true,
        };
      });

    const orphanResolved = await Promise.all(orphanCategories);

    // Auto-create Category documents for orphan categories
    for (const orphan of orphanResolved) {
      if (orphan.name && orphan.name !== 'Uncategorized') {
        const exists = await Category.findOne({
          restaurantId,
          name: orphan.name,
        });
        if (!exists) {
          await Category.create({
            name: orphan.name,
            restaurantId,
            isActive: true,
            sortOrder: 999,
          });
        }
      }
    }

    // Re-fetch all categories after auto-creation
    const allCategories = await Category.find({
      restaurantId,
    }).sort({ sortOrder: 1, name: 1 });

    const finalCategories = await Promise.all(
      allCategories.map(async (cat) => {
        const count = await FoodItem.countDocuments({
          restaurantId,
          category: cat.name,
        });
        return {
          _id: cat._id,
          name: cat.name,
          image: cat.image,
          isActive: cat.isActive,
          sortOrder: cat.sortOrder,
          itemCount: count,
        };
      })
    );

    return res.json({
      success: true,
      data: { categories: finalCategories },
    });
  } catch (error) {
    console.error('Get categories error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get categories',
    });
  }
};

// Add new category
export const addCategory = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { name, image, sortOrder } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Category name is required',
      });
    }

    const existing = await Category.findOne({
      restaurantId,
      name: name.trim(),
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Category already exists',
      });
    }

    const category = new Category({
      name: name.trim(),
      image: image || '',
      restaurantId,
      sortOrder: sortOrder || 0,
    });

    await category.save();

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: { category },
    });
  } catch (error) {
    console.error('Add category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create category',
    });
  }
};

// Update category
export const updateCategory = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { categoryId } = req.params;
    const { name, image, isActive, sortOrder } = req.body;

    const category = await Category.findOne({
      _id: categoryId,
      restaurantId,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const oldName = category.name;

    if (name) category.name = name.trim();
    if (image !== undefined) category.image = image;
    if (isActive !== undefined) category.isActive = isActive;
    if (sortOrder !== undefined) category.sortOrder = sortOrder;

    await category.save();

    if (name && name.trim() !== oldName) {
      await FoodItem.updateMany(
        { restaurantId, category: oldName },
        { category: name.trim() }
      );
    }

    return res.json({
      success: true,
      message: 'Category updated successfully',
      data: { category },
    });
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update category',
    });
  }
};

// Delete category
export const deleteCategory = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { categoryId } = req.params;

    const category = await Category.findOne({
      _id: categoryId,
      restaurantId,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    const itemCount = await FoodItem.countDocuments({
      restaurantId,
      category: category.name,
    });

    // If items use this category, move them to Uncategorized
    if (itemCount > 0) {
      await FoodItem.updateMany(
        { restaurantId, category: category.name },
        { category: 'Uncategorized' }
      );
    }

    // Now delete the category
    await Category.deleteOne({ _id: categoryId });

    return res.json({
      success: true,
      message: itemCount > 0
        ? `Category deleted. ${itemCount} items moved to Uncategorized.`
        : 'Category deleted successfully',
    });
  } catch (error) {
    console.error('Delete category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete category',
    });
  }
};

// Toggle category active status
export const toggleCategory = async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const { categoryId } = req.params;

    const category = await Category.findOne({
      _id: categoryId,
      restaurantId,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    category.isActive = !category.isActive;
    await category.save();

    return res.json({
      success: true,
      message: 'Category updated',
      data: { category },
    });
  } catch (error) {
    console.error('Toggle category error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update category',
    });
  }
};
