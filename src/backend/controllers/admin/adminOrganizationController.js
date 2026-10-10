/**
 * Organization Controller for Multi-Tenant Support
 * Additive only - does not modify existing functionality
 */
import Organization from '../../models/Organization.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import { requireOrganizationAccess } from '../../middleware/rbac.js';

/**
 * Get all organizations
 */
export const getOrganizations = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, isActive } = req.query;
    
    let filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } },
        { domain: { $regex: search, $options: 'i' } }
      ];
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }
    
    const organizations = await Organization.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Organization.countDocuments(filter);
    
    res.status(200).json({
      status: 'success',
      data: {
        organizations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching organizations',
      error: error.message
    });
  }
};

/**
 * Create a new organization
 */
export const createOrganization = async (req, res) => {
  try {
    const {
      name,
      slug,
      domain,
      primaryColor,
      secondaryColor,
      settings,
      subscription,
      contactInfo
    } = req.body;
    
    // Check if organization already exists
    const existingOrg = await Organization.findOne({
      $or: [
        { name },
        { slug },
        ...(domain ? [{ domain }] : [])
      ]
    });
    
    if (existingOrg) {
      return res.status(400).json({
        status: 'error',
        message: 'Organization with this name, slug, or domain already exists'
      });
    }
    
    const organization = await Organization.create({
      name,
      slug,
      domain,
      primaryColor,
      secondaryColor,
      settings,
      subscription,
      contactInfo
    });
    
    res.status(201).json({
      status: 'success',
      data: {
        organization
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error creating organization',
      error: error.message
    });
  }
};

/**
 * Update an organization
 */
export const updateOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Remove sensitive fields that shouldn't be updated directly
    delete updateData.createdAt;
    delete updateData.updatedAt;
    
    const organization = await Organization.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!organization) {
      return res.status(404).json({
        status: 'error',
        message: 'Organization not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        organization
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error updating organization',
      error: error.message
    });
  }
};

/**
 * Delete/deactivate an organization
 */
export const deleteOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if organization has active users
    const userCount = await User.countDocuments({ organizationId: id });
    if (userCount > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete organization with active users. Please reassign or delete users first.'
      });
    }
    
    const organization = await Organization.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );
    
    if (!organization) {
      return res.status(404).json({
        status: 'error',
        message: 'Organization not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      message: 'Organization deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting organization',
      error: error.message
    });
  }
};

/**
 * Get organization statistics
 */
export const getOrganizationStats = async (req, res) => {
  try {
    const { id } = req.params;
    
    const [
      userCount,
      vendorCount,
      riderCount,
      restaurantCount
    ] = await Promise.all([
      User.countDocuments({ organizationId: id }),
      User.countDocuments({ organizationId: id, role: 'vendor' }),
      User.countDocuments({ organizationId: id, role: 'rider' }),
      Restaurant.countDocuments({ organizationId: id })
    ]);
    
    const organization = await Organization.findById(id);
    
    if (!organization) {
      return res.status(404).json({
        status: 'error',
        message: 'Organization not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        organization,
        stats: {
          totalUsers: userCount,
          totalVendors: vendorCount,
          totalRiders: riderCount,
          totalRestaurants: restaurantCount,
          subscriptionStatus: organization.subscription.status,
          subscriptionPlan: organization.subscription.plan
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching organization statistics',
      error: error.message
    });
  }
};

/**
 * Get current user's organization
 */
export const getCurrentOrganization = async (req, res) => {
  try {
    const user = req.user;
    
    if (!user.organizationId) {
      return res.status(404).json({
        status: 'error',
        message: 'No organization assigned to user'
      });
    }
    
    const organization = await Organization.findById(user.organizationId);
    
    if (!organization) {
      return res.status(404).json({
        status: 'error',
        message: 'Organization not found'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: {
        organization
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching organization',
      error: error.message
    });
  }
};

/**
 * Switch organization context (for super admins)
 */
export const switchOrganization = async (req, res) => {
  try {
    const { organizationId } = req.body;
    const user = req.user;
    
    // Only super admins can switch organizations
    if (user.role !== 'admin' && user.rbacRole?.name !== 'super_admin') {
      return res.status(403).json({
        status: 'error',
        message: 'Access denied. Only super admins can switch organizations.'
      });
    }
    
    const organization = await Organization.findById(organizationId);
    if (!organization) {
      return res.status(404).json({
        status: 'error',
        message: 'Organization not found'
      });
    }
    
    // Update user's session/organization context
    // This would typically be stored in the JWT token or session
    req.sessionOrganization = organization;
    
    res.status(200).json({
      status: 'success',
      data: {
        organization,
        message: 'Organization context switched successfully'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error switching organization',
      error: error.message
    });
  }
};

/**
 * Get organization users
 */
export const getOrganizationUsers = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, role, search } = req.query;
    
    let filter = { organizationId: id };
    if (role) {
      filter.role = role;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const users = await User.find(filter)
      .populate('rbacRole', 'name displayName')
      .select('-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await User.countDocuments(filter);
    
    res.status(200).json({
      status: 'success',
      data: {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching organization users',
      error: error.message
    });
  }
};
