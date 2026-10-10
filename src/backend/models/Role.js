/**
 * Role model for Role-Based Access Control (RBAC)
 * Additive only - does not modify existing user roles
 */
import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
  resource: {
    type: String,
    required: true,
    enum: [
      'users', 'vendors', 'riders', 'orders', 'restaurants',
      'analytics', 'marketing', 'financial', 'settings',
      'backups', 'notifications', 'reports', 'dashboard'
    ]
  },
  actions: [{
    type: String,
    enum: ['create', 'read', 'update', 'delete', 'manage'],
    required: true
  }]
}, { _id: false });

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 50,
    match: [/^[a-zA-Z0-9_ -]+$/, 'Role name can only contain letters, numbers, spaces, underscores, and hyphens']
  },
  displayName: {
    type: String,
    required: true
  },
  /*
   * Optional, as the console has always presented it.
   *
   * It was required here while the "Create role" form marked it optional, so
   * creating a role without one failed validation and the screen reported
   * "Error creating role" with no clue that a blank note was the reason. A
   * role is identified by its name and its level; the description is a note
   * for whoever reads the list later.
   */
  description: {
    type: String,
    default: ''
  },
  permissions: [permissionSchema],
  isActive: {
    type: Boolean,
    default: true
  },
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  }
}, {
  timestamps: true
});

// Index for efficient queries
roleSchema.index({ isActive: 1 });

const Role = mongoose.model('Role', roleSchema);

export default Role;
