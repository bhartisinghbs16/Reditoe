/**
 * Marketing Integrity Service
 * Ensures data consistency and prevents duplicate campaigns/notifications
 */
import Campaign from '../models/Campaign.js';
import Notification from '../models/Notification.js';
import CampaignAnalytics from '../models/CampaignAnalytics.js';
import mongoose from 'mongoose';

class MarketingIntegrityService {
  /**
   * Check for duplicate campaign content
   */
  async checkDuplicateCampaignContent(campaignData, excludeId = null) {
    try {
      const query = {
        'content.title': campaignData.content?.title,
        'content.message': campaignData.content?.message,
        campaignType: campaignData.campaignType,
        createdBy: campaignData.createdBy,
      };

      if (excludeId) {
        query._id = { $ne: excludeId };
      }

      // Check for campaigns created in the last 7 days with similar content
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      query.createdAt = { $gte: sevenDaysAgo };

      const duplicateCampaign = await Campaign.findOne(query);

      if (duplicateCampaign) {
        return {
          isDuplicate: true,
          existingCampaign: {
            id: duplicateCampaign._id,
            name: duplicateCampaign.name,
            status: duplicateCampaign.status,
            createdAt: duplicateCampaign.createdAt,
          },
          message: 'A similar campaign was created in the last 7 days',
        };
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error('Error checking duplicate campaign content:', error);
      throw error;
    }
  }

  /**
   * Validate campaign targeting integrity
   */
  async validateTargetingIntegrity(targeting, campaignId = null) {
    try {
      const issues = [];

      // Check if targeting rules are too restrictive
      const estimatedAudience = await this.estimateTargetAudience(targeting);
      
      if (estimatedAudience.total === 0) {
        issues.push({
          type: 'EMPTY_AUDIENCE',
          message: 'Targeting rules will result in zero users',
          severity: 'HIGH',
        });
      } else if (estimatedAudience.total < 10) {
        issues.push({
          type: 'SMALL_AUDIENCE',
          message: `Target audience is very small (${estimatedAudience.total} users)`,
          severity: 'MEDIUM',
        });
      }

      // Check for conflicting targeting rules
      if (targeting.specificUsers && targeting.specificUsers.length > 0) {
        if (targeting.userRoles && targeting.userRoles.length > 0) {
          issues.push({
            type: 'CONFLICTING_RULES',
            message: 'Specific users targeting conflicts with role-based targeting',
            severity: 'LOW',
          });
        }

        if (targeting.excludeUsers && targeting.excludeUsers.length > 0) {
          const overlap = targeting.specificUsers.filter(userId => 
            targeting.excludeUsers.includes(userId)
          );
          if (overlap.length > 0) {
            issues.push({
              type: 'CONFLICTING_RULES',
              message: `${overlap.length} users are both included and excluded`,
              severity: 'HIGH',
            });
          }
        }
      }

      // Check for unrealistic spending targets
      if (targeting.spendingHistory) {
        const { minSpent, maxSpent } = targeting.spendingHistory;
        if (minSpent && minSpent > 10000) {
          issues.push({
            type: 'UNREALISTIC_TARGET',
            message: 'Minimum spending threshold is very high',
            severity: 'MEDIUM',
          });
        }
      }

      // Check for unrealistic order history
      if (targeting.orderHistory) {
        const { minOrders, maxOrders } = targeting.orderHistory;
        if (minOrders && minOrders > 100) {
          issues.push({
            type: 'UNREALISTIC_TARGET',
            message: 'Minimum order threshold is very high',
            severity: 'MEDIUM',
          });
        }
      }

      return {
        isValid: issues.filter(i => i.severity === 'HIGH').length === 0,
        issues,
        estimatedAudience,
      };
    } catch (error) {
      console.error('Error validating targeting integrity:', error);
      throw error;
    }
  }

  /**
   * Estimate target audience size
   */
  async estimateTargetAudience(targeting) {
    try {
      const User = mongoose.model('User');
      let query = { isActive: true };

      // Apply targeting rules (simplified version)
      if (targeting.userRoles && targeting.userRoles.length > 0) {
        query.role = { $in: targeting.userRoles };
      }

      if (targeting.cities && targeting.cities.length > 0) {
        query['address.city'] = { $in: targeting.cities };
      }

      if (targeting.specificUsers && targeting.specificUsers.length > 0) {
        query._id = { $in: targeting.specificUsers };
      }

      if (targeting.excludeUsers && targeting.excludeUsers.length > 0) {
        query._id = { ...query._id, $nin: targeting.excludeUsers };
      }

      const totalUsers = await User.countDocuments(query);

      // Get breakdown by role
      const roleBreakdown = await User.aggregate([
        { $match: query },
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]);

      return {
        total: totalUsers,
        roleBreakdown: roleBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
      };
    } catch (error) {
      console.error('Error estimating target audience:', error);
      return { total: 0, roleBreakdown: {} };
    }
  }

  /**
   * Check for campaign scheduling conflicts
   */
  async checkSchedulingConflicts(campaignData, excludeId = null) {
    try {
      if (campaignData.schedule?.type !== 'SCHEDULED') {
        return { hasConflicts: false };
      }

      const scheduledTime = new Date(campaignData.schedule.scheduledAt);
      const timeWindow = 60 * 60 * 1000; // 1 hour window

      const query = {
        status: 'SCHEDULED',
        'schedule.type': 'SCHEDULED',
        'schedule.scheduledAt': {
          $gte: new Date(scheduledTime.getTime() - timeWindow),
          $lte: new Date(scheduledTime.getTime() + timeWindow),
        },
      };

      if (excludeId) {
        query._id = { $ne: excludeId };
      }

      const conflictingCampaigns = await Campaign.find(query)
        .select('name schedule.scheduledAt targeting.userRoles')
        .limit(5);

      if (conflictingCampaigns.length > 0) {
        // Check if they target similar audiences
        const similarAudience = conflictingCampaigns.filter(campaign => {
          const campaignRoles = campaign.targeting?.userRoles || [];
          const newCampaignRoles = campaignData.targeting?.userRoles || [];
          
          // If both target the same roles, consider it similar
          return campaignRoles.some(role => newCampaignRoles.includes(role));
        });

        return {
          hasConflicts: true,
          conflictingCampaigns: conflictingCampaigns.map(c => ({
            id: c._id,
            name: c.name,
            scheduledAt: c.schedule.scheduledAt,
            hasSimilarAudience: similarAudience.some(sc => sc._id.toString() === c._id.toString()),
          })),
          message: similarAudience.length > 0 
            ? 'Campaigns with similar audiences scheduled around the same time'
            : 'Multiple campaigns scheduled around the same time',
        };
      }

      return { hasConflicts: false };
    } catch (error) {
      console.error('Error checking scheduling conflicts:', error);
      throw error;
    }
  }

  /**
   * Validate campaign budget constraints
   */
  async validateBudgetConstraints(campaignData) {
    try {
      const issues = [];

      if (!campaignData.budget) {
        return { isValid: true, issues: [] };
      }

      const { total, costPerSend } = campaignData.budget;

      // Validate budget amounts
      if (total && total <= 0) {
        issues.push({
          type: 'INVALID_BUDGET',
          message: 'Total budget must be greater than 0',
          severity: 'HIGH',
        });
      }

      if (costPerSend && costPerSend < 0) {
        issues.push({
          type: 'INVALID_BUDGET',
          message: 'Cost per send cannot be negative',
          severity: 'HIGH',
        });
      }

      // Check if budget is realistic
      if (total && total > 100000) {
        issues.push({
          type: 'HIGH_BUDGET',
          message: 'Budget amount is very high, please confirm',
          severity: 'MEDIUM',
        });
      }

      // Estimate if budget is sufficient for targeting
      if (total && costPerSend) {
        const estimatedAudience = await this.estimateTargetAudience(campaignData.targeting);
        const estimatedCost = estimatedAudience.total * costPerSend;

        if (estimatedCost > total) {
          issues.push({
            type: 'INSUFFICIENT_BUDGET',
            message: `Estimated cost (₹${estimatedCost.toFixed(2)}) exceeds budget (₹${total.toFixed(2)})`,
            severity: 'HIGH',
          });
        }
      }

      return {
        isValid: issues.filter(i => i.severity === 'HIGH').length === 0,
        issues,
        estimatedCost: total && costPerSend ? 
          (await this.estimateTargetAudience(campaignData.targeting)).total * costPerSend : null,
      };
    } catch (error) {
      console.error('Error validating budget constraints:', error);
      throw error;
    }
  }

  /**
   * Clean up orphaned analytics records
   */
  async cleanupOrphanedAnalytics() {
    try {
      console.log('🧹 Cleaning up orphaned analytics records...');

      // Find analytics records without corresponding campaigns
      const orphanedAnalytics = await CampaignAnalytics.aggregate([
        {
          $lookup: {
            from: 'campaigns',
            localField: 'campaignId',
            foreignField: '_id',
            as: 'campaign',
          },
        },
        {
          $match: {
            campaign: { $size: 0 },
          },
        },
      ]);

      if (orphanedAnalytics.length > 0) {
        const orphanedIds = orphanedAnalytics.map(a => a._id);
        await CampaignAnalytics.deleteMany({ _id: { $in: orphanedIds } });
        console.log(`🗑️ Deleted ${orphanedIds.length} orphaned analytics records`);
      }

      // Find campaigns without analytics (older than 1 hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const campaignsWithoutAnalytics = await Campaign.find({
        createdAt: { $lt: oneHourAgo },
        status: { $in: ['COMPLETED', 'CANCELLED'] },
      });

      const campaignIds = campaignsWithoutAnalytics.map(c => c._id);
      const existingAnalytics = await CampaignAnalytics.find({
        campaignId: { $in: campaignIds },
      }).distinct('campaignId');

      const missingAnalytics = campaignIds.filter(id => !existingAnalytics.includes(id));

      if (missingAnalytics.length > 0) {
        console.log(`⚠️ Found ${missingAnalytics.length} campaigns missing analytics`);
        // Could trigger analytics generation here
      }

      return {
        orphanedDeleted: orphanedAnalytics.length,
        missingAnalytics: missingAnalytics.length,
      };
    } catch (error) {
      console.error('Error cleaning up orphaned analytics:', error);
      throw error;
    }
  }

  /**
   * Validate notification delivery integrity
   */
  async validateNotificationIntegrity(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const issues = [];

      // Check for mismatched delivery counts
      const deliveryLogCount = campaign.deliveryLogs.length;
      const metricsTargetCount = campaign.metrics.targetCount;

      if (deliveryLogCount !== metricsTargetCount) {
        issues.push({
          type: 'COUNT_MISMATCH',
          message: `Delivery logs (${deliveryLogCount}) don't match target count (${metricsTargetCount})`,
          severity: 'MEDIUM',
        });
      }

      // Check for stuck pending deliveries
      const pendingDeliveries = campaign.deliveryLogs.filter(log => 
        log.status === 'PENDING'
      );

      if (pendingDeliveries.length > 0) {
        const oldPending = pendingDeliveries.filter(log => {
          const createdAt = new Date(log.createdAt || campaign.createdAt);
          const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
          return ageHours > 24; // Older than 24 hours
        });

        if (oldPending.length > 0) {
          issues.push({
            type: 'STUCK_DELIVERIES',
            message: `${oldPending.length} deliveries have been pending for over 24 hours`,
            severity: 'HIGH',
          });
        }
      }

      // Check for high failure rate
      const failedDeliveries = campaign.deliveryLogs.filter(log => 
        log.status === 'FAILED'
      );

      if (deliveryLogCount > 0) {
        const failureRate = (failedDeliveries.length / deliveryLogCount) * 100;
        if (failureRate > 20) {
          issues.push({
            type: 'HIGH_FAILURE_RATE',
            message: `High failure rate: ${failureRate.toFixed(1)}%`,
            severity: 'HIGH',
          });
        }
      }

      return {
        isValid: issues.filter(i => i.severity === 'HIGH').length === 0,
        issues,
        stats: {
          totalDeliveries: deliveryLogCount,
          pendingDeliveries: pendingDeliveries.length,
          failedDeliveries: failedDeliveries.length,
          successRate: deliveryLogCount > 0 ? 
            ((deliveryLogCount - failedDeliveries.length) / deliveryLogCount * 100).toFixed(1) : 0,
        },
      };
    } catch (error) {
      console.error('Error validating notification integrity:', error);
      throw error;
    }
  }

  /**
   * Comprehensive campaign health check
   */
  async performCampaignHealthCheck(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const healthCheck = {
        campaignId,
        campaignName: campaign.name,
        status: campaign.status,
        checks: {},
        overallHealth: 'HEALTHY',
      };

      // Targeting integrity
      const targetingCheck = await this.validateTargetingIntegrity(
        campaign.targeting, 
        campaignId
      );
      healthCheck.checks.targeting = targetingCheck;

      // Budget constraints
      const budgetCheck = await this.validateBudgetConstraints(campaign);
      healthCheck.checks.budget = budgetCheck;

      // Notification integrity
      const notificationCheck = await this.validateNotificationIntegrity(campaignId);
      healthCheck.checks.notifications = notificationCheck;

      // Scheduling conflicts (for scheduled campaigns)
      if (campaign.status === 'SCHEDULED') {
        const schedulingCheck = await this.checkSchedulingConflicts(campaign, campaignId);
        healthCheck.checks.scheduling = schedulingCheck;
      }

      // Determine overall health
      const highSeverityIssues = Object.values(healthCheck.checks)
        .filter(check => check.issues)
        .flatMap(check => check.issues)
        .filter(issue => issue.severity === 'HIGH');

      const mediumSeverityIssues = Object.values(healthCheck.checks)
        .filter(check => check.issues)
        .flatMap(check => check.issues)
        .filter(issue => issue.severity === 'MEDIUM');

      if (highSeverityIssues.length > 0) {
        healthCheck.overallHealth = 'CRITICAL';
      } else if (mediumSeverityIssues.length > 0) {
        healthCheck.overallHealth = 'WARNING';
      }

      return healthCheck;
    } catch (error) {
      console.error('Error performing campaign health check:', error);
      throw error;
    }
  }
}

export default new MarketingIntegrityService();
