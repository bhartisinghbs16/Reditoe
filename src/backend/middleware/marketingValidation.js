/**
 * Marketing Validation Middleware
 * Provides validation and integrity checks for marketing operations
 */
import Campaign from '../models/Campaign.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';
import mongoose from 'mongoose';

/**
 * Validate campaign creation data
 */
export const validateCampaignCreation = async (req, res, next) => {
  try {
    const { name, campaignType, content, targeting, schedule } = req.body;

    // Basic required fields validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Campaign name is required and must be a non-empty string',
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        status: 'error',
        message: 'Campaign name cannot exceed 100 characters',
      });
    }

    if (!campaignType || !['PUSH_NOTIFICATION', 'BANNER', 'EMAIL', 'MULTI_CHANNEL'].includes(campaignType)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid campaign type. Must be one of: PUSH_NOTIFICATION, BANNER, EMAIL, MULTI_CHANNEL',
      });
    }

    // Content validation based on campaign type
    if (campaignType === 'PUSH_NOTIFICATION' || campaignType === 'EMAIL') {
      if (!content?.title || typeof content.title !== 'string' || content.title.trim().length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Content title is required for this campaign type',
        });
      }

      if (content.title.length > 200) {
        return res.status(400).json({
          status: 'error',
          message: 'Content title cannot exceed 200 characters',
        });
      }

      if (!content?.message || typeof content.message !== 'string' || content.message.trim().length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Content message is required for this campaign type',
        });
      }

      if (content.message.length > 1000) {
        return res.status(400).json({
          status: 'error',
          message: 'Content message cannot exceed 1000 characters',
        });
      }
    }

    // Validate URLs if provided
    if (content?.imageUrl && !isValidUrl(content.imageUrl)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid image URL format',
      });
    }

    if (content?.actionUrl && !isValidUrl(content.actionUrl)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid action URL format',
      });
    }

    // Validate targeting rules
    if (targeting) {
      await validateTargetingRules(targeting);
    }

    // Validate schedule
    if (schedule?.type === 'SCHEDULED') {
      if (!schedule.scheduledAt) {
        return res.status(400).json({
          status: 'error',
          message: 'Scheduled campaigns must have a scheduledAt date',
        });
      }

      const scheduledDate = new Date(schedule.scheduledAt);
      const now = new Date();

      if (scheduledDate <= now) {
        return res.status(400).json({
          status: 'error',
          message: 'Scheduled date must be in the future',
        });
      }

      // Don't allow scheduling more than 1 year in advance
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 1);
      if (scheduledDate > maxDate) {
        return res.status(400).json({
          status: 'error',
          message: 'Campaign cannot be scheduled more than 1 year in advance',
        });
      }
    }

    // Check for duplicate campaign names
    const existingCampaign = await Campaign.findOne({ 
      name: name.trim(),
      createdBy: req.user?.id 
    });

    if (existingCampaign) {
      return res.status(400).json({
        status: 'error',
        message: 'A campaign with this name already exists',
      });
    }

    next();
  } catch (error) {
    console.error('Campaign validation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Validation failed',
    });
  }
};

/**
 * Validate targeting rules
 */
const validateTargetingRules = async (targeting) => {
  // Validate user roles
  if (targeting.userRoles && !Array.isArray(targeting.userRoles)) {
    throw new Error('userRoles must be an array');
  }

  if (targeting.userRoles) {
    const validRoles = ['CUSTOMER', 'VENDOR', 'RIDER', 'ADMIN'];
    const invalidRoles = targeting.userRoles.filter(role => !validRoles.includes(role));
    if (invalidRoles.length > 0) {
      throw new Error(`Invalid user roles: ${invalidRoles.join(', ')}`);
    }
  }

  // Validate cities
  if (targeting.cities && !Array.isArray(targeting.cities)) {
    throw new Error('cities must be an array');
  }

  // Validate areas
  if (targeting.areas && !Array.isArray(targeting.areas)) {
    throw new Error('areas must be an array');
  }

  // Validate age groups
  if (targeting.ageGroups && !Array.isArray(targeting.ageGroups)) {
    throw new Error('ageGroups must be an array');
  }

  if (targeting.ageGroups) {
    const validAgeGroups = ['18-24', '25-34', '35-44', '45-54', '55+'];
    const invalidAgeGroups = targeting.ageGroups.filter(age => !validAgeGroups.includes(age));
    if (invalidAgeGroups.length > 0) {
      throw new Error(`Invalid age groups: ${invalidAgeGroups.join(', ')}`);
    }
  }

  // Validate genders
  if (targeting.genders && !Array.isArray(targeting.genders)) {
    throw new Error('genders must be an array');
  }

  if (targeting.genders) {
    const validGenders = ['male', 'female', 'other'];
    const invalidGenders = targeting.genders.filter(gender => !validGenders.includes(gender));
    if (invalidGenders.length > 0) {
      throw new Error(`Invalid genders: ${invalidGenders.join(', ')}`);
    }
  }

  // Validate user types
  if (targeting.userTypes && !Array.isArray(targeting.userTypes)) {
    throw new Error('userTypes must be an array');
  }

  if (targeting.userTypes) {
    const validUserTypes = ['new', 'existing', 'premium', 'inactive'];
    const invalidUserTypes = targeting.userTypes.filter(type => !validUserTypes.includes(type));
    if (invalidUserTypes.length > 0) {
      throw new Error(`Invalid user types: ${invalidUserTypes.join(', ')}`);
    }
  }

  // Validate specific users
  if (targeting.specificUsers && targeting.specificUsers.length > 0) {
    if (!Array.isArray(targeting.specificUsers)) {
      throw new Error('specificUsers must be an array');
    }

    // Check if user IDs are valid
    for (const userId of targeting.specificUsers) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error(`Invalid user ID: ${userId}`);
      }
    }

    // Check if users exist
    const existingUsers = await User.find({ _id: { $in: targeting.specificUsers } });
    if (existingUsers.length !== targeting.specificUsers.length) {
      throw new Error('One or more specific users do not exist');
    }
  }

  // Validate exclude users
  if (targeting.excludeUsers && targeting.excludeUsers.length > 0) {
    if (!Array.isArray(targeting.excludeUsers)) {
      throw new Error('excludeUsers must be an array');
    }

    // Check if user IDs are valid
    for (const userId of targeting.excludeUsers) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        throw new Error(`Invalid exclude user ID: ${userId}`);
      }
    }

    // Check if users exist
    const existingUsers = await User.find({ _id: { $in: targeting.excludeUsers } });
    if (existingUsers.length !== targeting.excludeUsers.length) {
      throw new Error('One or more exclude users do not exist');
    }
  }

  // Validate order history
  if (targeting.orderHistory) {
    const { minOrders, maxOrders, lastOrderDays } = targeting.orderHistory;

    if (minOrders !== undefined && (typeof minOrders !== 'number' || minOrders < 0)) {
      throw new Error('minOrders must be a non-negative number');
    }

    if (maxOrders !== undefined && (typeof maxOrders !== 'number' || maxOrders < 0)) {
      throw new Error('maxOrders must be a non-negative number');
    }

    if (minOrders !== undefined && maxOrders !== undefined && minOrders > maxOrders) {
      throw new Error('minOrders cannot be greater than maxOrders');
    }

    if (lastOrderDays !== undefined && (typeof lastOrderDays !== 'number' || lastOrderDays < 0)) {
      throw new Error('lastOrderDays must be a non-negative number');
    }
  }

  // Validate spending history
  if (targeting.spendingHistory) {
    const { minSpent, maxSpent } = targeting.spendingHistory;

    if (minSpent !== undefined && (typeof minSpent !== 'number' || minSpent < 0)) {
      throw new Error('minSpent must be a non-negative number');
    }

    if (maxSpent !== undefined && (typeof maxSpent !== 'number' || maxSpent < 0)) {
      throw new Error('maxSpent must be a non-negative number');
    }

    if (minSpent !== undefined && maxSpent !== undefined && minSpent > maxSpent) {
      throw new Error('minSpent cannot be greater than maxSpent');
    }
  }
};

/**
 * Validate campaign update data
 */
export const validateCampaignUpdate = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Check if campaign exists
    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({
        status: 'error',
        message: 'Campaign not found',
      });
    }

    // Prevent updates to active/completed campaigns
    if (['ACTIVE', 'COMPLETED'].includes(campaign.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot update active or completed campaigns',
      });
    }

    // Validate name if provided
    if (updateData.name) {
      if (typeof updateData.name !== 'string' || updateData.name.trim().length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Campaign name must be a non-empty string',
        });
      }

      if (updateData.name.length > 100) {
        return res.status(400).json({
          status: 'error',
          message: 'Campaign name cannot exceed 100 characters',
        });
      }

      // Check for duplicate names (excluding current campaign)
      const existingCampaign = await Campaign.findOne({ 
        name: updateData.name.trim(),
        createdBy: req.user?.id,
        _id: { $ne: id }
      });

      if (existingCampaign) {
        return res.status(400).json({
          status: 'error',
          message: 'A campaign with this name already exists',
        });
      }
    }

    // Validate targeting if provided
    if (updateData.targeting) {
      await validateTargetingRules(updateData.targeting);
    }

    // Attach campaign to request for use in controller
    req.campaign = campaign;
    next();
  } catch (error) {
    console.error('Campaign update validation error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Validation failed',
    });
  }
};

/**
 * Validate campaign activation
 */
export const validateCampaignActivation = async (req, res, next) => {
  try {
    const { id } = req.params;

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({
        status: 'error',
        message: 'Campaign not found',
      });
    }

    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
      return res.status(400).json({
        status: 'error',
        message: 'Only draft or scheduled campaigns can be activated',
      });
    }

    // Check if campaign has valid content
    if (!campaign.content.title || !campaign.content.message) {
      return res.status(400).json({
        status: 'error',
        message: 'Campaign must have valid title and message before activation',
      });
    }

    // Check if scheduled campaign is ready
    if (campaign.status === 'SCHEDULED' && campaign.schedule.type === 'SCHEDULED') {
      const scheduledDate = new Date(campaign.schedule.scheduledAt);
      const now = new Date();

      if (scheduledDate <= now) {
        return res.status(400).json({
          status: 'error',
          message: 'Scheduled date must be in the future',
        });
      }
    }

    // Check if user has permission to activate campaigns
    if (!['admin', 'marketing'].includes(req.user?.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'Insufficient permissions to activate campaigns',
      });
    }

    req.campaign = campaign;
    next();
  } catch (error) {
    console.error('Campaign activation validation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Validation failed',
    });
  }
};

/**
 * Validate campaign control operations (pause, resume, cancel)
 */
export const validateCampaignControl = async (req, res, next) => {
  try {
    console.log('=== CAMPAIGN CONTROL MIDDLEWARE CALLED ===');
    console.log('Method:', req.method);
    console.log('URL:', req.url);
    console.log('Params:', req.params);
    console.log('Body:', req.body);
    console.log('==========================================');
    
    const { id } = req.params;
    const { action } = req.body; // pause, resume, cancel

    const campaign = await Campaign.findById(id);
    if (!campaign) {
      return res.status(404).json({
        status: 'error',
        message: 'Campaign not found',
      });
    }

    // Validate campaign status for the requested action
    switch (action) {
      case 'pause':
        console.log('=== PAUSE VALIDATION ===');
        console.log('Campaign status:', campaign.status);
        console.log('Required status: ACTIVE');
        if (campaign.status !== 'ACTIVE') {
          console.log('PAUSE VALIDATION FAILED - Campaign not active');
          return res.status(400).json({
            status: 'error',
            message: 'Can only pause active campaigns',
          });
        }
        console.log('PAUSE VALIDATION PASSED');
        break;

      case 'resume':
        console.log('=== RESUME VALIDATION ===');
        console.log('Campaign status:', campaign.status);
        console.log('Required status: PAUSED');
        console.log('Campaign ID:', campaign._id);
        if (campaign.status !== 'PAUSED') {
          console.log('RESUME VALIDATION FAILED - Campaign not paused');
          return res.status(400).json({
            status: 'error',
            message: 'Can only resume paused campaigns',
          });
        }
        console.log('RESUME VALIDATION PASSED');
        break;

      case 'cancel':
        if (campaign.status === 'COMPLETED') {
          return res.status(400).json({
            status: 'error',
            message: 'Cannot cancel completed campaigns',
          });
        }
        break;

      default:
        return res.status(400).json({
          status: 'error',
          message: 'Invalid action. Must be pause, resume, or cancel',
        });
    }

    // Check permissions
    if (!['admin', 'marketing'].includes(req.user?.role)) {
      return res.status(403).json({
        status: 'error',
        message: 'Insufficient permissions to control campaigns',
      });
    }

    req.campaign = campaign;
    next();
  } catch (error) {
    console.error('Campaign control validation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Validation failed',
    });
  }
};

/**
 * Prevent duplicate notifications
 */
export const preventDuplicateNotifications = async (req, res, next) => {
  try {
    const { title, message, recipient, campaignId } = req.body;

    // Check for similar recent notifications (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const duplicateQuery = {
      title,
      message,
      recipient,
      createdAt: { $gte: oneDayAgo }
    };

    if (campaignId) {
      duplicateQuery.campaignId = campaignId;
    }

    const existingNotification = await Notification.findOne(duplicateQuery);

    if (existingNotification) {
      return res.status(400).json({
        status: 'error',
        message: 'A similar notification was sent in the last 24 hours',
        data: {
          existingNotificationId: existingNotification._id,
          sentAt: existingNotification.createdAt
        }
      });
    }

    next();
  } catch (error) {
    console.error('Duplicate notification check error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Validation failed',
    });
  }
};

/**
 * Validate targeting preview
 */
export const validateTargetingPreview = async (req, res, next) => {
  try {
    const { targeting } = req.body;

    if (!targeting || typeof targeting !== 'object') {
      return res.status(400).json({
        status: 'error',
        message: 'Targeting rules are required',
      });
    }

    await validateTargetingRules(targeting);
    next();
  } catch (error) {
    console.error('Targeting preview validation error:', error);
    res.status(400).json({
      status: 'error',
      message: error.message || 'Invalid targeting rules',
    });
  }
};

/**
 * Simple URL validation
 */
const isValidUrl = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Rate limiting for campaign operations
 */
export const campaignRateLimit = (maxOperations = 5, windowMs = 60 * 60 * 1000) => {
  const operations = new Map();

  return (req, res, next) => {
    const userId = req.user?.id;
    const now = Date.now();

    if (!operations.has(userId)) {
      operations.set(userId, []);
    }

    const userOperations = operations.get(userId);
    const recentOperations = userOperations.filter(time => now - time < windowMs);

    if (recentOperations.length >= maxOperations) {
      return res.status(429).json({
        status: 'error',
        message: `Too many campaign operations. Maximum ${maxOperations} per ${windowMs / (60 * 60 * 1000)} hour(s).`,
      });
    }

    recentOperations.push(now);
    operations.set(userId, recentOperations);

    // Clean up old entries
    setTimeout(() => {
      const currentOps = operations.get(userId) || [];
      const updatedOps = currentOps.filter(time => Date.now() - time < windowMs);
      if (updatedOps.length === 0) {
        operations.delete(userId);
      } else {
        operations.set(userId, updatedOps);
      }
    }, windowMs);

    next();
  };
};
