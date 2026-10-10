/**
 * Admin Incentive Template Controller
 * Handles CRUD operations for incentive templates
 */

import IncentiveTemplate from '../../models/IncentiveTemplate.js';
import IncentiveService from '../../services/incentiveService.js';
import User from '../../models/User.js';
import RiderIncentiveProgress from '../../models/RiderIncentiveProgress.js';

/**
 * Create incentive template
 * POST /api/admin/incentives/templates
 */
export const createIncentiveTemplate = async (req, res) => {
  try {
    const {
      name,
      description,
      type,
      targetValue,
      rewardAmount,
      periodType,
      periodStart,
      periodEnd,
      conditions,
      isActive = true,
      maxClaims = 1,
      priority = 0,
      autoAssign = true,
      targetRiderIds,
      excludeRiderIds,
      difficulty = 'medium',
      category = 'performance',
      tags
    } = req.body;

    // Validate required fields
    if (!name || !description || !type || !targetValue || !rewardAmount) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required fields: name, description, type, targetValue, rewardAmount'
      });
    }

    // Validate period dates for custom periods
    if (periodType === 'custom' && (!periodStart || !periodEnd)) {
      return res.status(400).json({
        status: 'error',
        message: 'Period start and end dates are required for custom periods'
      });
    }

    // Create template
    const template = new IncentiveTemplate({
      name,
      description,
      type,
      targetValue,
      rewardAmount,
      periodType,
      periodStart,
      periodEnd,
      conditions: conditions || {},
      isActive,
      maxClaims,
      priority,
      autoAssign,
      targetRiderIds: targetRiderIds || [],
      excludeRiderIds: excludeRiderIds || [],
      difficulty,
      category,
      tags: tags || [],
      createdBy: req.admin.id
    });

    await template.save();

    // Auto-assign to riders if specified
    if (autoAssign && targetRiderIds.length > 0) {
      await IncentiveService.assignIncentivesToRiders(template._id, targetRiderIds);
    }

    res.status(201).json({
      status: 'success',
      data: template,
      message: 'Incentive template created successfully'
    });
  } catch (error) {
    console.error('Error creating incentive template:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create incentive template',
    });
  }
};

/**
 * Update incentive template
 * PUT /api/admin/incentives/templates/:id
 */
export const updateIncentiveTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Validate template exists
    const template = await IncentiveTemplate.findById(id);
    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Incentive template not found'
      });
    }

    // Validate period dates for custom periods
    if (updates.periodType === 'custom' && (!updates.periodStart || !updates.periodEnd)) {
      return res.status(400).json({
        status: 'error',
        message: 'Period start and end dates are required for custom periods'
      });
    }

    // Update template
    Object.assign(template, updates, {
      updatedAt: new Date()
    });

    await template.save();

    res.status(200).json({
      status: 'success',
      data: template,
      message: 'Incentive template updated successfully'
    });
  } catch (error) {
    console.error('Error updating incentive template:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update incentive template',
    });
  }
};

/**
 * Get all incentive templates
 * GET /api/admin/incentives/templates
 */
export const getIncentiveTemplates = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      type, 
      category 
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    if (category) query.category = category;

    const skip = (page - 1) * limit;

    const templates = await IncentiveTemplate.find(query)
      .populate('createdBy', 'name email')
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await IncentiveTemplate.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: templates,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      message: 'Templates retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting incentive templates:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch incentive templates',
    });
  }
};

/**
 * Get single incentive template
 * GET /api/admin/incentives/templates/:id
 */
export const getIncentiveTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await IncentiveTemplate.findById(id)
      .populate('createdBy', 'name email');
    
    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Incentive template not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: template,
      message: 'Template retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting incentive template:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch incentive template'
    });
  }
};

/**
 * Delete incentive template
 * DELETE /api/admin/incentives/templates/:id
 */
export const deleteIncentiveTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await IncentiveTemplate.findById(id);
    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Incentive template not found'
      });
    }

    // Check if template has active progress
    const activeProgress = await RiderIncentiveProgress.countDocuments({
      templateId: id,
      status: 'active'
    });

    if (activeProgress > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete template with active progress'
      });
    }

    await IncentiveTemplate.findByIdAndDelete(id);

    res.status(200).json({
      status: 'success',
      message: 'Incentive template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting incentive template:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete incentive template',
    });
  }
};

/**
 * Toggle template active status
 * PATCH /api/admin/incentives/templates/:id/toggle
 */
export const toggleIncentiveTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await IncentiveTemplate.findById(id);
    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Incentive template not found'
      });
    }

    template.isActive = !template.isActive;
    await template.save();

    res.status(200).json({
      status: 'success',
      data: template,
      message: `Template ${template.isActive ? 'activated' : 'deactivated'} successfully`
    });
  } catch (error) {
    console.error('Error toggling incentive template:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to toggle incentive template',
    });
  }
};

/**
 * Assign incentive to riders
 * POST /api/admin/incentives/templates/:id/assign
 */
export const assignIncentiveToRiders = async (req, res) => {
  try {
    const { id } = req.params;
    const { riderIds } = req.body;

    if (!riderIds || riderIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Rider IDs are required'
      });
    }

    const template = await IncentiveTemplate.findById(id);
    if (!template) {
      return res.status(404).json({
        status: 'error',
        message: 'Incentive template not found'
      });
    }

    const assignments = await IncentiveService.assignIncentivesToRiders(id, riderIds);

    res.status(200).json({
      status: 'success',
      data: assignments,
      message: `Incentive assigned to ${assignments.length} riders`
    });
  } catch (error) {
    console.error('Error assigning incentive to riders:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to assign incentive to riders'
    });
  }
};

/**
 * Get incentive statistics
 * GET /api/admin/incentives/stats
 */
export const getIncentiveStats = async (req, res) => {
  try {
    const stats = await IncentiveService.getIncentiveStats();
    
    res.status(200).json({
      status: 'success',
      data: stats,
      message: 'Incentive statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting incentive stats:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to get incentive statistics'
    });
  }
};

/**
 * Create sample incentive templates
 * POST /api/admin/incentives/create-samples
 */
export const createSampleTemplates = async (req, res) => {
  try {
    const sampleTemplates = [
      {
        name: "Weekend Warrior",
        description: "Complete 15 orders this weekend for extra reward!",
        type: "orders_completed",
        targetValue: 15,
        rewardAmount: 250,
        periodType: "weekly",
        difficulty: "medium",
        category: "engagement",
        tags: ["weekend", "orders", "bonus"],
        conditions: {
          minOrderValue: 50
        }
      },
      {
        name: "Daily Earner",
        description: "Earn ₹500 in a single day",
        type: "earnings_target",
        targetValue: 500,
        rewardAmount: 100,
        periodType: "daily",
        difficulty: "hard",
        category: "performance",
        tags: ["daily", "earnings", "target"]
      },
      {
        name: "Rating Star",
        description: "Maintain 4.5+ average rating for 30 days",
        type: "rating_target",
        targetValue: 4.5,
        rewardAmount: 150,
        periodType: "monthly",
        difficulty: "medium",
        category: "quality",
        tags: ["rating", "quality", "customer"]
      },
      {
        name: "Peak Hours Pro",
        description: "Complete 8 orders during peak hours (6PM-10PM)",
        type: "orders_completed",
        targetValue: 8,
        rewardAmount: 120,
        periodType: "daily",
        difficulty: "medium",
        category: "performance",
        tags: ["peak", "time", "efficiency"],
        conditions: {
          timeRestrictions: ["peak_hours"]
        }
      }
    ];

    const createdTemplates = [];
    
    for (const templateData of sampleTemplates) {
      try {
        const template = new IncentiveTemplate({
          ...templateData,
          createdBy: req.admin.id
        });
        await template.save();
        createdTemplates.push(template);
      } catch (error) {
        console.error('Error creating sample template:', error);
      }
    }

    res.status(201).json({
      status: 'success',
      data: createdTemplates,
      message: `Created ${createdTemplates.length} sample incentive templates`
    });
  } catch (error) {
    console.error('Error creating sample templates:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create sample templates'
    });
  }
};
