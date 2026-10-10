/**
 * Admin Campaign Controller
 * Handles marketing campaign creation, management, and analytics
 */
import Campaign from '../../models/Campaign.js';
import CampaignAnalytics from '../../models/CampaignAnalytics.js';
import User from '../../models/User.js';
import NotificationDeliveryService from '../../services/NotificationDeliveryService.js';

/**
 * GET /api/admin/campaigns
 * Get all campaigns with pagination and filters
 */
export const getCampaigns = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      campaignType,
      // The admin console calls this field `type`; the model calls it
      // campaignType. Accepted both ways so its filter isn't silently ignored.
      type,
      status,
      startDate,
      endDate,
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'content.title': { $regex: search, $options: 'i' } },
      ];
    }
    
    if (campaignType || type) query.campaignType = campaignType || type;
    if (status) query.status = status;
    
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const campaigns = await Campaign.find(query)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('activatedBy', 'name email')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await Campaign.countDocuments(query);

    res.status(200).json({
      status: 'success',
      data: {
        // `type` mirrors campaignType so a client can read either name.
        campaigns: campaigns.map((campaign) => ({
          ...campaign,
          type: campaign.campaignType,
        })),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      },
      // Every other admin list endpoint carries the totals at the top level.
      // Kept alongside `pagination` so existing readers of that keep working
      // while a client reading the common envelope gets a correct pager
      // instead of one that thinks there is a single page.
      total,
      page: parseInt(page),
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch campaigns',
    });
  }
};

/**
 * GET /api/admin/campaigns/:id
 * Get a single campaign by ID
 */
export const getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await Campaign.findById(id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('activatedBy', 'name email')
      .populate('deliveryLogs.userId', 'name email');

    if (!campaign) {
      return res.status(404).json({
        status: 'error',
        message: 'Campaign not found',
      });
    }

    res.status(200).json({
      status: 'success',
      data: { campaign },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch campaign',
    });
  }
};

/**
 * POST /api/admin/campaigns
 * Create a new campaign
 */
export const createCampaign = async (req, res) => {
  try {
    const campaignData = {
      ...req.body,
      createdBy: req.user?.id,
    };

    // Validate targeting rules
    if (campaignData.targeting) {
      // Validate specific users exist
      if (campaignData.targeting.specificUsers && campaignData.targeting.specificUsers.length > 0) {
        const users = await User.find({ _id: { $in: campaignData.targeting.specificUsers } });
        if (users.length !== campaignData.targeting.specificUsers.length) {
          return res.status(400).json({
            status: 'error',
            message: 'One or more specific user IDs are invalid',
          });
        }
      }

      // Validate exclude users exist
      if (campaignData.targeting.excludeUsers && campaignData.targeting.excludeUsers.length > 0) {
        const users = await User.find({ _id: { $in: campaignData.targeting.excludeUsers } });
        if (users.length !== campaignData.targeting.excludeUsers.length) {
          return res.status(400).json({
            status: 'error',
            message: 'One or more exclude user IDs are invalid',
          });
        }
      }
    }

    // Validate scheduled date
    if (campaignData.schedule?.type === 'SCHEDULED' && !campaignData.schedule.scheduledAt) {
      return res.status(400).json({
        status: 'error',
        message: 'Scheduled campaigns must have a scheduledAt date',
      });
    }

    const campaign = new Campaign(campaignData);
    await campaign.save();

    const populatedCampaign = await Campaign.findById(campaign._id)
      .populate('createdBy', 'name email');

    res.status(201).json({
      status: 'success',
      message: 'Campaign created successfully',
      data: {
        campaign: populatedCampaign,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create campaign',
    });
  }
};

/**
 * PUT /api/admin/campaigns/:id
 * Update a campaign
 */
export const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = {
      ...req.body,
      updatedBy: req.user?.id,
    };

    const campaign = await Campaign.findById(id)
      .populate('deliveryLogs.userId', 'name email address.city address.area role userTypes');
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

    // Validate targeting rules if updated
    if (updateData.targeting) {
      if (updateData.targeting.specificUsers && updateData.targeting.specificUsers.length > 0) {
        const users = await User.find({ _id: { $in: updateData.targeting.specificUsers } });
        if (users.length !== updateData.targeting.specificUsers.length) {
          return res.status(400).json({
            status: 'error',
            message: 'One or more specific user IDs are invalid',
          });
        }
      }
    }

    Object.assign(campaign, updateData);
    await campaign.save();

    const populatedCampaign = await Campaign.findById(campaign._id)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(200).json({
      status: 'success',
      message: 'Campaign updated successfully',
      data: {
        campaign: populatedCampaign,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update campaign',
    });
  }
};

/**
 * DELETE /api/admin/campaigns/:id
 * Delete a campaign
 */
export const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await Campaign.findById(id)
      .populate('deliveryLogs.userId', 'name email address.city address.area role userTypes');
    if (!campaign) {
      return res.status(404).json({
        status: 'error',
        message: 'Campaign not found',
      });
    }

    // Prevent deletion of active campaigns
    if (campaign.status === 'ACTIVE') {
      return res.status(400).json({
        status: 'error',
        message: 'Cannot delete active campaigns. Pause or cancel first.',
      });
    }

    await Campaign.findByIdAndDelete(id);

    res.status(200).json({
      status: 'success',
      message: 'Campaign deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete campaign',
    });
  }
};

/**
 * POST /api/admin/campaigns/:id/activate
 * Activate a campaign and start delivery
 */
export const activateCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await Campaign.findById(id)
      .populate('deliveryLogs.userId', 'name email address.city address.area role userTypes');
    if (!campaign) {
      return res.status(404).json({
        status: 'error',
        message: 'Campaign not found',
      });
    }

    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      return res.status(400).json({
        status: 'error',
        message: 'Only draft or scheduled campaigns can be activated',
      });
    }

    const activatedCampaign = await NotificationDeliveryService.activateCampaign(campaign);

    res.status(200).json({
      status: 'success',
      message: 'Campaign activated successfully',
      data: {
        campaign: activatedCampaign,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to activate campaign',
    });
  }
};

/**
 * POST /api/admin/campaigns/:id/pause
 * Pause an active campaign
 */
export const pauseCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await NotificationDeliveryService.pauseCampaign(id);

    res.status(200).json({
      status: 'success',
      message: 'Campaign paused successfully',
      data: {
        campaign,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to pause campaign',
    });
  }
};

/**
 * POST /api/admin/campaigns/:id/resume
 * Resume a paused campaign
 */
export const resumeCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await NotificationDeliveryService.resumeCampaign(id);

    res.status(200).json({
      status: 'success',
      message: 'Campaign resumed successfully',
      data: {
        campaign,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to resume campaign',
    });
  }
};

/**
 * POST /api/admin/campaigns/:id/cancel
 * Cancel a campaign
 */
export const cancelCampaign = async (req, res) => {
  try {
    const { id } = req.params;

    const campaign = await NotificationDeliveryService.cancelCampaign(id);

    res.status(200).json({
      status: 'success',
      message: 'Campaign cancelled successfully',
      data: {
        campaign,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to cancel campaign',
    });
  }
};

/**
 * POST /api/admin/campaigns/:id/set-status
 * Development endpoint to manually set campaign status for testing
 */
export const setCampaignStatus = async (req, res) => {
  try {    const { id } = req.params;
    const { status } = req.body;

    const campaign = await Campaign.findById(id)
      .populate('deliveryLogs.userId', 'name email address.city address.area role userTypes');
    
    if (!campaign) {
      return res.status(404).json({
        status: 'error',
        message: 'Campaign not found',
      });
    }

    // Validate status
    const validStatuses = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    campaign.status = status;
    await campaign.save();

    res.status(200).json({
      status: 'success',
      message: `Campaign status set to ${status}`,
      data: { campaign },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to set campaign status',
    });
  }
};

/**
 * GET /api/admin/campaigns/:id/analytics
 * Get campaign analytics and performance metrics
 */
export const getCampaignAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    const campaign = await Campaign.findById(id)
      .populate('deliveryLogs.userId', 'name email address.city address.area role userTypes');
    if (!campaign) {
      return res.status(404).json({
        status: 'error',
        message: 'Campaign not found',
      });
    }

    const performanceMetrics = campaign.getPerformanceMetrics();
    
    // Get delivery breakdown
    const deliveryBreakdown = {
      pending: campaign.deliveryLogs.filter(log => log.status === 'PENDING').length,
      sent: campaign.deliveryLogs.filter(log => log.status === 'SENT').length,
      delivered: campaign.deliveryLogs.filter(log => log.status === 'DELIVERED').length,
      failed: campaign.deliveryLogs.filter(log => log.status === 'FAILED').length,
      opened: campaign.deliveryLogs.filter(log => log.status === 'OPENED').length,
      clicked: campaign.deliveryLogs.filter(log => log.status === 'CLICKED').length,
    };

    // Geographic breakdown - get real user location data
    const geographicBreakdown = {};
    campaign.deliveryLogs.forEach(log => {
      const city = log.userId?.address?.city || 'Unknown';
      
      if (!geographicBreakdown[city]) {
        geographicBreakdown[city] = { sent: 0, delivered: 0, opened: 0, clicked: 0 };
      }
      if (log.status === 'SENT') geographicBreakdown[city].sent += 1;
      if (log.status === 'DELIVERED') geographicBreakdown[city].delivered += 1;
      if (log.status === 'OPENED') geographicBreakdown[city].opened += 1;
      if (log.status === 'CLICKED') geographicBreakdown[city].clicked += 1;
    });

    // Time-based breakdown
    const timeBreakdown = {};
    campaign.deliveryLogs.forEach(log => {
      if (log.sentAt) {
        const date = log.sentAt.toDateString();
        if (!timeBreakdown[date]) {
          timeBreakdown[date] = { sent: 0, delivered: 0, opened: 0, clicked: 0 };
        }
        timeBreakdown[date].sent += 1;
      }
      if (log.deliveredAt) {
        const date = log.deliveredAt.toDateString();
        if (!timeBreakdown[date]) {
          timeBreakdown[date] = { sent: 0, delivered: 0, opened: 0, clicked: 0 };
        }
        timeBreakdown[date].delivered += 1;
      }
      if (log.openedAt) {
        const date = log.openedAt.toDateString();
        if (!timeBreakdown[date]) {
          timeBreakdown[date] = { sent: 0, delivered: 0, opened: 0, clicked: 0 };
        }
        timeBreakdown[date].opened += 1;
      }
      if (log.clickedAt) {
        const date = log.clickedAt.toDateString();
        if (!timeBreakdown[date]) {
          timeBreakdown[date] = { sent: 0, delivered: 0, opened: 0, clicked: 0 };
        }
        timeBreakdown[date].clicked += 1;
      }
    });

    // Recent delivery logs
    const recentDeliveries = campaign.deliveryLogs
      .sort((a, b) => b.sentAt - a.sentAt)
      .slice(0, 50)
      .map(log => ({
        userId: log.userId,
        status: log.status,
        sentAt: log.sentAt,
        deliveredAt: log.deliveredAt,
        errorMessage: log.errorMessage,
        retryCount: log.retryCount,
      }));

    res.status(200).json({
      status: 'success',
      data: {
        campaign: {
          id: campaign._id,
          name: campaign.name,
          type: campaign.campaignType,
          status: campaign.status,
          createdAt: campaign.createdAt,
        },
        performanceMetrics,
        deliveryBreakdown,
        geographicBreakdown,
        timeBreakdown,
        recentDeliveries,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch campaign analytics',
    });
  }
};

/**
 * GET /api/admin/campaigns/analytics/overview
 * Get overall campaign analytics
 */
export const getCampaignOverview = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const analytics = await Campaign.getCampaignAnalytics(
      startDate ? new Date(startDate) : null,
      endDate ? new Date(endDate) : null
    );

    // Get recent campaigns
    const recentCampaigns = await Campaign.find()
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get campaign status breakdown
    const statusBreakdown = await Campaign.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]);

    // Get campaign type breakdown
    const typeBreakdown = await Campaign.aggregate([
      {
        $group: {
          _id: '$campaignType',
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        analytics,
        recentCampaigns,
        statusBreakdown,
        typeBreakdown,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch campaign overview',
    });
  }
};

/**
 * POST /api/admin/campaigns/preview-targeting
 * Preview target audience size for a campaign
 */
export const previewTargeting = async (req, res) => {
  try {
    const { targeting } = req.body;

    // Create a temporary campaign instance to use the targeting logic
    const tempCampaign = new Campaign({ targeting });
    const targetUsers = await tempCampaign.calculateTargetUsers();

    // Get breakdown of target users
    const breakdown = await User.aggregate([
      { $match: { _id: { $in: targetUsers.map(u => u._id) } } },
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
        },
      },
    ]);

    const cityBreakdown = await User.aggregate([
      { $match: { _id: { $in: targetUsers.map(u => u._id) } } },
      {
        $group: {
          _id: '$address.city',
          count: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        totalUsers: targetUsers.length,
        roleBreakdown: breakdown,
        cityBreakdown: cityBreakdown,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to preview targeting',
    });
  }
};

/**
 * POST /api/admin/campaigns/process-scheduled
 * Process all scheduled campaigns (system endpoint)
 */
export const processScheduledCampaigns = async (req, res) => {
  try {
    const result = await NotificationDeliveryService.processScheduledCampaigns();

    res.status(200).json({
      status: 'success',
      message: 'Scheduled campaigns processed successfully',
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to process scheduled campaigns',
    });
  }
};
