/**
 * Notification Delivery Service
 * Handles actual push notification delivery with targeting, scheduling, and retry logic
 */
import Campaign from '../models/Campaign.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import mongoose from 'mongoose';

class NotificationDeliveryService {
  constructor() {
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
    this.batchSize = 100; // Process in batches
  }

  /**
   * Process scheduled campaigns
   */
  async processScheduledCampaigns() {
    try {
      const scheduledCampaigns = await Campaign.findScheduledCampaigns();
      
      for (const campaign of scheduledCampaigns) {
        await this.activateCampaign(campaign);
      }
      
      return {
        processed: scheduledCampaigns.length,
        campaigns: scheduledCampaigns.map(c => ({ id: c._id, name: c.name }))
      };
    } catch (error) {
      console.error('Error processing scheduled campaigns:', error);
      throw error;
    }
  }

  /**
   * Activate a campaign and start delivery
   */
  async activateCampaign(campaign) {
    try {
      // Update campaign status
      campaign.status = 'ACTIVE';
      campaign.activatedAt = new Date();
      campaign.activatedBy = null; // System activation
      await campaign.save();

      // Start delivery process
      await this.deliverCampaign(campaign);
      
      return campaign;
    } catch (error) {
      console.error(`Error activating campaign ${campaign._id}:`, error);
      campaign.status = 'CANCELLED';
      await campaign.save();
      throw error;
    }
  }

  /**
   * Deliver campaign to target users
   */
  async deliverCampaign(campaign) {
    try {
      const targetUsers = await this.buildTargetAudience(campaign);
      
      // Update target count
      campaign.metrics.targetCount = targetUsers.length;
      await campaign.save();

      // Process in batches
      for (let i = 0; i < targetUsers.length; i += this.batchSize) {
        const batch = targetUsers.slice(i, i + this.batchSize);
        await this.processBatch(campaign, batch);
        
        // Small delay between batches to avoid overwhelming
        if (i + this.batchSize < targetUsers.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Mark campaign as completed if all deliveries are processed
      const pendingDeliveries = campaign.deliveryLogs.filter(log => log.status === 'PENDING').length;
      if (pendingDeliveries === 0) {
        campaign.status = 'COMPLETED';
        campaign.completedAt = new Date();
        await campaign.save();
      }

      return {
        targetCount: targetUsers.length,
        batchesProcessed: Math.ceil(targetUsers.length / this.batchSize)
      };
    } catch (error) {
      console.error(`Error delivering campaign ${campaign._id}:`, error);
      throw error;
    }
  }

  /**
   * Build target audience based on campaign targeting rules
   */
  async buildTargetAudience(campaign) {
    try {
      let query = { isActive: true };
      
      // Role targeting
      if (campaign.targeting.userRoles && campaign.targeting.userRoles.length > 0) {
        query.role = { $in: campaign.targeting.userRoles };
      }
      
      // Geographic targeting
      if (campaign.targeting.cities && campaign.targeting.cities.length > 0) {
        query['address.city'] = { $in: campaign.targeting.cities };
      }
      
      // Area targeting
      if (campaign.targeting.areas && campaign.targeting.areas.length > 0) {
        query['address.area'] = { $in: campaign.targeting.areas };
      }
      
      // Age targeting
      if (campaign.targeting.ageGroups && campaign.targeting.ageGroups.length > 0) {
        const ageConditions = campaign.targeting.ageGroups.map(group => {
          const [min, max] = group.split('-').map(Number);
          return {
            $expr: {
              $and: [
                { $gte: [{ $year: new Date() }, { $year: '$dateOfBirth' }] },
                { $lte: [{ $year: new Date() }, { $year: '$dateOfBirth' }] }
              ]
            }
          };
        });
        query.$or = ageConditions;
      }
      
      // Gender targeting
      if (campaign.targeting.genders && campaign.targeting.genders.length > 0) {
        query.gender = { $in: campaign.targeting.genders };
      }
      
      // User type targeting
      if (campaign.targeting.userTypes && campaign.targeting.userTypes.length > 0) {
        const typeConditions = [];
        
        if (campaign.targeting.userTypes.includes('new')) {
          typeConditions.push({
            createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          });
        }
        
        if (campaign.targeting.userTypes.includes('existing')) {
          typeConditions.push({
            createdAt: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
          });
        }
        
        if (campaign.targeting.userTypes.includes('inactive')) {
          typeConditions.push({
            lastActiveAt: { $lt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) }
          });
        }
        
        if (typeConditions.length > 0) {
          query.$and = query.$and || [];
          query.$and.push({ $or: typeConditions });
        }
      }
      
      // Order history targeting
      if (campaign.targeting.orderHistory) {
        const orderHistoryQuery = {};
        
        if (campaign.targeting.orderHistory.minOrders) {
          orderHistoryQuery.orderCount = { $gte: campaign.targeting.orderHistory.minOrders };
        }
        
        if (campaign.targeting.orderHistory.maxOrders) {
          orderHistoryQuery.orderCount = { ...orderHistoryQuery.orderCount, $lte: campaign.targeting.orderHistory.maxOrders };
        }
        
        if (campaign.targeting.orderHistory.lastOrderDays) {
          const cutoffDate = new Date(Date.now() - campaign.targeting.orderHistory.lastOrderDays * 24 * 60 * 60 * 1000);
          orderHistoryQuery.lastOrderAt = { $gte: cutoffDate };
        }
        
        if (Object.keys(orderHistoryQuery).length > 0) {
          const usersWithOrderHistory = await User.aggregate([
            { $match: query },
            {
              $lookup: {
                from: 'orders',
                localField: '_id',
                foreignField: 'userId',
                as: 'orders'
              }
            },
            {
              $addFields: {
                orderCount: { $size: '$orders' },
                lastOrderAt: { $max: '$orders.createdAt' }
              }
            },
            { $match: orderHistoryQuery },
            { $project: { _id: 1 } }
          ]);
          
          query._id = { $in: usersWithOrderHistory.map(u => u._id) };
        }
      }
      
      // Spending history targeting
      if (campaign.targeting.spendingHistory) {
        const spendingQuery = {};
        
        if (campaign.targeting.spendingHistory.minSpent) {
          spendingQuery.totalSpent = { $gte: campaign.targeting.spendingHistory.minSpent };
        }
        
        if (campaign.targeting.spendingHistory.maxSpent) {
          spendingQuery.totalSpent = { ...spendingQuery.totalSpent, $lte: campaign.targeting.spendingHistory.maxSpent };
        }
        
        if (Object.keys(spendingQuery).length > 0) {
          const usersWithSpendingHistory = await User.aggregate([
            { $match: query },
            {
              $lookup: {
                from: 'orders',
                localField: '_id',
                foreignField: 'userId',
                as: 'orders'
              }
            },
            {
              $addFields: {
                totalSpent: { $sum: '$orders.totalAmount' }
              }
            },
            { $match: spendingQuery },
            { $project: { _id: 1 } }
          ]);
          
          query._id = { $in: usersWithSpendingHistory.map(u => u._id) };
        }
      }
      
      // Exclude specific users
      if (campaign.targeting.excludeUsers && campaign.targeting.excludeUsers.length > 0) {
        query._id = { ...query._id, $nin: campaign.targeting.excludeUsers };
      }
      
      // Specific users override all other targeting
      if (campaign.targeting.specificUsers && campaign.targeting.specificUsers.length > 0) {
        query._id = { $in: campaign.targeting.specificUsers };
      }
      
      const users = await User.find(query).select('_id name email role deviceTokens address');
      return users;
    } catch (error) {
      console.error('Error building target audience:', error);
      throw error;
    }
  }

  /**
   * Process a batch of users for notification delivery
   */
  async processBatch(campaign, users) {
    const deliveryPromises = users.map(user => this.deliverToUser(campaign, user));
    const results = await Promise.allSettled(deliveryPromises);
    
    // Handle failed deliveries
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      console.error(`Failed to deliver ${failures.length} notifications in batch`);
      failures.forEach(failure => {
        console.error('Delivery failure:', failure.reason);
      });
    }
    
    return {
      processed: users.length,
      successful: results.filter(r => r.status === 'fulfilled').length,
      failed: failures.length
    };
  }

  /**
   * Deliver notification to a single user
   */
  async deliverToUser(campaign, user) {
    try {
      // Create notification record
      const notification = await Notification.create({
        title: campaign.content.title,
        message: campaign.content.message,
        type: 'PROMOTIONAL',
        recipient: 'SPECIFIC',
        campaignId: campaign._id,
        userId: user._id,
        isSent: false,
        createdBy: campaign.createdBy,
      });

      // Attempt to send push notification
      const deliveryResult = await this.sendPushNotification(user, campaign.content);
      
      // Update campaign delivery log
      if (deliveryResult.success) {
        await campaign.updateDeliveryStatus(user._id, 'SENT');
        notification.isSent = true;
        notification.sentAt = new Date();
        await notification.save();
      } else {
        await campaign.updateDeliveryStatus(user._id, 'FAILED', {
          errorMessage: deliveryResult.error
        });
        
        // Schedule retry if under max retries
        const deliveryLog = campaign.deliveryLogs.find(log => 
          log.userId.toString() === user._id.toString()
        );
        
        if (deliveryLog.retryCount < this.maxRetries) {
          setTimeout(() => {
            this.retryDelivery(campaign, user, deliveryLog.retryCount + 1);
          }, this.retryDelay * Math.pow(2, deliveryLog.retryCount));
        }
      }

      return deliveryResult;
    } catch (error) {
      console.error(`Error delivering to user ${user._id}:`, error);
      await campaign.updateDeliveryStatus(user._id, 'FAILED', {
        errorMessage: error.message
      });
      throw error;
    }
  }

  /**
   * Send push notification to user device
   */
  async sendPushNotification(user, content) {
    try {
      // This would integrate with actual push notification service
      // For now, we'll simulate the delivery
      
      if (!user.deviceTokens || user.deviceTokens.length === 0) {
        return {
          success: false,
          error: 'No device tokens available'
        };
      }

      // Simulate push notification delivery
      // In production, this would use Firebase Cloud Messaging, Apple Push Notification Service, etc.
      console.log(`Sending push notification to ${user.name}:`, {
        title: content.title,
        message: content.message,
        deviceCount: user.deviceTokens.length
      });

      // Simulate 95% success rate
      const isSuccess = Math.random() > 0.05;
      
      if (isSuccess) {
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Push notification service unavailable'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Retry failed notification delivery
   */
  async retryDelivery(campaign, user, retryCount) {
    try {
      const deliveryResult = await this.sendPushNotification(user, campaign.content);
      
      if (deliveryResult.success) {
        await campaign.updateDeliveryStatus(user._id, 'SENT');
      } else {
        await campaign.updateDeliveryStatus(user._id, 'FAILED', {
          errorMessage: deliveryResult.error
        });
        
        // Schedule another retry if under max retries
        if (retryCount < this.maxRetries) {
          setTimeout(() => {
            this.retryDelivery(campaign, user, retryCount + 1);
          }, this.retryDelay * Math.pow(2, retryCount));
        }
      }
    } catch (error) {
      console.error(`Retry failed for user ${user._id}:`, error);
      await campaign.updateDeliveryStatus(user._id, 'FAILED', {
        errorMessage: error.message
      });
    }
  }

  /**
   * Track notification interaction (open/click)
   */
  async trackInteraction(campaignId, userId, interactionType) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      if (interactionType === 'open') {
        await campaign.updateDeliveryStatus(userId, 'OPENED');
      } else if (interactionType === 'click') {
        await campaign.updateDeliveryStatus(userId, 'CLICKED');
      }

      return campaign;
    } catch (error) {
      console.error('Error tracking interaction:', error);
      throw error;
    }
  }

  /**
   * Get delivery statistics for a campaign
   */
  async getDeliveryStats(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      return campaign.getPerformanceMetrics();
    } catch (error) {
      console.error('Error getting delivery stats:', error);
      throw error;
    }
  }

  /**
   * Cancel a campaign
   */
  async cancelCampaign(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      if (campaign.status === 'COMPLETED') {
        throw new Error('Cannot cancel completed campaign');
      }

      campaign.status = 'CANCELLED';
      await campaign.save();

      return campaign;
    } catch (error) {
      console.error('Error cancelling campaign:', error);
      throw error;
    }
  }

  /**
   * Pause a campaign
   */
  async pauseCampaign(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      if (campaign.status !== 'ACTIVE') {
        throw new Error('Can only pause active campaigns');
      }

      campaign.status = 'PAUSED';
      await campaign.save();

      return campaign;
    } catch (error) {
      console.error('Error pausing campaign:', error);
      throw error;
    }
  }

  /**
   * Resume a paused campaign
   */
  async resumeCampaign(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      if (campaign.status !== 'PAUSED') {
        throw new Error('Can only resume paused campaigns');
      }

      campaign.status = 'ACTIVE';
      await campaign.save();

      // Resume delivery for pending notifications
      const pendingDeliveries = campaign.deliveryLogs.filter(log => log.status === 'PENDING');
      if (pendingDeliveries.length > 0) {
        await this.deliverCampaign(campaign);
      }

      return campaign;
    } catch (error) {
      console.error('Error resuming campaign:', error);
      throw error;
    }
  }
}

export default new NotificationDeliveryService();
