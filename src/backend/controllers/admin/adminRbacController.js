/**
 * RBAC Controller for Role-Based Access Control
 * Additive only - does not modify existing functionality
 */
import Role from '../../models/Role.js';
import User from '../../models/User.js';
import Organization from '../../models/Organization.js';

/**
 * Answers a failed write with the reason for it.
 *
 * Mongoose rejects a bad document by throwing, and each of these handlers
 * caught that and replied 500 "Error creating role" — true, useless, and
 * indistinguishable from the server being broken. A document the caller got
 * wrong is a 400, and the field that was wrong is the one thing worth saying:
 * "Description is required" tells an admin what to do next; "Error creating
 * role" does not.
 */
function failed(res, error, fallback) {
  if (error?.name === 'ValidationError') {
    const reasons = Object.values(error.errors || {}).map((e) => e.message);
    return res.status(400).json({
      status: 'error',
      message: reasons.join(' ') || fallback,
      error: error.message,
    });
  }
  // A unique index refusing a second row with the same name.
  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'value';
    return res.status(400).json({
      status: 'error',
      message: `That ${field} is already taken.`,
      error: error.message,
    });
  }
  return res.status(500).json({ status: 'error', message: fallback, error: error.message });
}



/**
 * Get organizations for dropdown (used when creating/editing RBAC users)
 */
export const getOrganizationsForDropdown = async (req, res) => {
  try {
    const organizations = await Organization.find({ isActive: true })
      .select('name slug')
      .sort({ name: 1 });

    res.status(200).json({
      status: 'success',
      data: {
        organizations
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
 * Get all roles with their permissions
 */
export const getRoles = async (req, res) => {
  try {
    const roles = await Role.find({ isActive: true }).sort({ level: 1 });
    
    res.status(200).json({
      status: 'success',
      results: roles.length,
      data: {
        roles
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching roles',
      error: error.message
    });
  }
};

/**
 * Create a new role (Super Admin only)
 */
export const createRole = async (req, res) => {
  try {
    const { name, displayName, description, permissions, level } = req.body;

    if (!name || !displayName) {
      return res.status(400).json({
        status: 'error',
        message: 'Role name and display name are required'
      });
    }

    // Check if role already exists
    const existingRole = await Role.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existingRole) {
      return res.status(400).json({
        status: 'error',
        message: 'Role with this name already exists'
      });
    }

    const role = await Role.create({
      name,
      displayName,
      description,
      permissions,
      level
    });

    res.status(201).json({
      status: 'success',
      data: {
        role
      }
    });
  } catch (error) {
    return failed(res, error, 'Error creating role');
  }
};

/**
 * Update an existing role (Super Admin only)
 */
export const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, description, permissions, isActive } = req.body;

    const role = await Role.findByIdAndUpdate(
      id,
      { displayName, description, permissions, isActive },
      { new: true, runValidators: true }
    );

    if (!role) {
      return res.status(404).json({
        status: 'error',
        message: 'Role not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        role
      }
    });
  } catch (error) {
    return failed(res, error, 'Error updating role');
  }
};

/**
 * Delete/deactivate a role (Super Admin only)
 */
export const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if role is assigned to any users
    const usersWithRole = await User.countDocuments({ 
      rbacRole: id,
      isActive: true 
    });

    if (usersWithRole > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete role. It is assigned to active users.'
      });
    }

    const role = await Role.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true }
    );

    if (!role) {
      return res.status(404).json({
        status: 'error',
        message: 'Role not found'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Role deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting role',
      error: error.message
    });
  }
};

/**
 * Get all admin users with their roles
 */
export const getAdminUsers = async (req, res) => {
  try {
    const { organizationId } = req.query;
    
    let filter = { 
      $or: [
        { role: 'admin' },
        { role: { $exists: true, $ne: null } }
      ]
    };

    if (organizationId) {
      filter.organizationId = organizationId;
    }

    const users = await User.find(filter)
      .populate('rbacRole')
      .populate('organizationId', 'name slug')
      .select('-password -otp -otpExpires -resetPasswordToken -resetPasswordExpires')
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: 'success',
      results: users.length,
      data: {
        users
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching admin users',
      error: error.message
    });
  }
};

/**
 * Create a new admin user with role assignment
 */
export const createAdminUser = async (req, res) => {
  try {
    const { name, email, password, roleId, organizationId } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'User with this email already exists'
      });
    }

    // Validate role
    const role = await Role.findById(roleId);
    if (!role) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid role specified'
      });
    }

    // Validate organization if specified
    if (organizationId) {
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid organization specified'
        });
      }
    }

    const user = await User.create({
      name,
      email,
      password,
      role: 'admin',
      rbacRole: roleId,
      organizationId,
      isBlocked: false
    });

    // Populate role and organization for response
    await user.populate(['rbacRole', 'organizationId']);

    res.status(201).json({
      status: 'success',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          rbacRole: user.rbacRole,
          organizationId: user.organizationId,
          isActive: !user.isBlocked,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    return failed(res, error, 'Error creating admin user');
  }
};

/**
 * Update admin user role and organization
 */
export const updateAdminUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, roleId, organizationId, isActive } = req.body;

    // Validate role if specified
    if (roleId) {
      const role = await Role.findById(roleId);
      if (!role) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid role specified'
        });
      }
    }

    // Validate organization if specified
    if (organizationId) {
      const organization = await Organization.findById(organizationId);
      if (!organization) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid organization specified'
        });
      }
    }

    const updateData = {
      name,
      email,
      role: 'admin',
      rbacRole: roleId,
      organizationId,
      isBlocked: !isActive
    };

    const user = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate(['rbacRole', 'organizationId']);

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          rbacRole: user.rbacRole,
          organizationId: user.organizationId,
          isActive: !user.isBlocked,
          updatedAt: user.updatedAt
        }
      }
    });
  } catch (error) {
    return failed(res, error, 'Error updating admin user');
  }
};

/**
 * Get user permissions for frontend access control
 */
export const getUserPermissions = async (req, res) => {
  try {
    const user = req.user;

    // RBAC user
    if (user.rbacRole && user.rbacRole.name) {
      const permissions = [];
      user.rbacRole.permissions.forEach(perm => {
        perm.actions.forEach(action => {
          permissions.push(`${perm.resource}:${action}`);
        });
      });

      return res.status(200).json({
        status: 'success',
        data: {
          permissions,
          role: {
            name: user.rbacRole.name,
            displayName: user.rbacRole.displayName,
            level: user.rbacRole.level
          },
          organizationId: user.organizationId || null
        }
      });
    }

    // Legacy admin - full access (fallback if no rbacRole)
    if (user.role === 'admin') {
      return res.status(200).json({
        status: 'success',
        data: {
          permissions: ['*'],
          role: {
            name: 'admin',
            displayName: 'Administrator',
            level: 1
          },
          organizationId: user.organizationId || null
        }
      });
    }

    res.status(403).json({
      status: 'error',
      message: 'No valid role found'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching user permissions',
      error: error.message
    });
  }
};
