/**
 * Incentive Service
 * Handles all incentive-related business logic including progress tracking, completion detection, and reward distribution
 */

import mongoose from 'mongoose';
import IncentiveTemplate from '../models/IncentiveTemplate.js';
import RiderIncentiveProgress from '../models/RiderIncentiveProgress.js';
import RiderEarning from '../models/RiderEarning.js';
import User from '../models/User.js';
import Order from '../models/Order.js';
import RiderWallet from '../models/RiderWallet.js';

class IncentiveService {
  /**
   * Get active incentives for a rider
   */
  static async getActiveIncentives(riderId) {
    try {
      // Get rider data for eligibility checking
      const rider = await User.findById(riderId);
      if (!rider) {
        throw new Error('Rider not found');
      }

      // Get active templates
      const templates = await IncentiveTemplate.getTemplatesForRider(riderId, {
        currentRating: rider.currentRating || 0
      });

      // Get or create progress records for each template
      const activeIncentives = [];
      
      for (const template of templates) {
        let progress = await RiderIncentiveProgress.findOne({
          riderId,
          templateId: template._id,
          status: { $in: ['active', 'completed'] }
        });

        // Create progress record if doesn't exist
        if (!progress) {
          progress = await this.createProgressRecord(riderId, template);
        }

        // Update progress if active
        if (progress.status === 'active') {
          await this.updateProgress(riderId, progress._id);
        }

        // Check if expired
        if (progress.isExpired && progress.status !== 'expired') {
          progress.status = 'expired';
          await progress.save();
        }

        if (progress.status === 'active' || progress.status === 'completed') {
          activeIncentives.push({
            template,
            progress: {
              _id: progress._id,
              currentProgress: progress.currentProgress,
              targetProgress: progress.targetProgress,
              status: progress.status,
              progressPercentage: progress.progressPercentage,
              startedAt: progress.startedAt,
              completedAt: progress.completedAt,
              expiresAt: progress.expiresAt,
              rewardAmount: progress.rewardAmount,
              claimed: progress.claimed,
              claimedAt: progress.claimedAt,
              lastProgressUpdate: progress.lastProgressUpdate,
              estimatedCompletion: progress.estimatedCompletion,
              canClaim: progress.canClaim
            }
          });
        }
      }

      // Sort by priority and progress
      activeIncentives.sort((a, b) => {
        // First by completion status
        if (a.progress.status === 'completed' && b.progress.status !== 'completed') return -1;
        if (a.progress.status !== 'completed' && b.progress.status === 'completed') return 1;
        
        // Then by priority
        return b.template.priority - a.template.priority;
      });

      return activeIncentives;
    } catch (error) {
      console.error('Error getting active incentives:', error);
      throw error;
    }
  }

  /**
   * Create a new progress record for a rider and template
   */
  static async createProgressRecord(riderId, template) {
    try {
      // Calculate expiration based on period type
      let expiresAt = new Date();
      
      switch (template.periodType) {
        case 'daily':
          expiresAt.setDate(expiresAt.getDate() + 1);
          expiresAt.setHours(0, 0, 0, 0);
          break;
        case 'weekly':
          expiresAt.setDate(expiresAt.getDate() + 7);
          expiresAt.setHours(0, 0, 0, 0);
          break;
        case 'monthly':
          expiresAt.setMonth(expiresAt.getMonth() + 1);
          expiresAt.setDate(1);
          expiresAt.setHours(0, 0, 0, 0);
          break;
        case 'custom':
          expiresAt = template.periodEnd;
          break;
        default:
          expiresAt.setDate(expiresAt.getDate() + 7);
      }

      const progress = new RiderIncentiveProgress({
        riderId,
        templateId: template._id,
        targetProgress: template.targetValue,
        rewardAmount: template.rewardAmount,
        expiresAt,
        status: 'active'
      });

      await progress.save();
      return progress;
    } catch (error) {
      console.error('Error creating progress record:', error);
      throw error;
    }
  }

  /**
   * Update progress for a specific incentive
   */
  static async updateProgress(riderId, progressId, trigger = 'auto_calculation', metadata = {}) {
    try {
      const progress = await RiderIncentiveProgress.findById(progressId);
      if (!progress) {
        throw new Error('Progress record not found');
      }

      const template = await IncentiveTemplate.findById(progress.templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Get rider data for progress calculation
      const riderData = await this.getRiderData(riderId);
      
      // Calculate current progress
      const currentProgress = template.calculateProgress(riderData, metadata);
      
      // Update progress
      const updatedProgress = await progress.updateProgress(currentProgress, trigger, metadata);
      await updatedProgress.save();

      return updatedProgress;
    } catch (error) {
      console.error('Error updating progress:', error);
      throw error;
    }
  }

  /**
   * Update progress when an order is completed
   */
  static async updateProgressOnOrder(riderId, orderData) {
    try {
      // Get all active progress records for this rider
      const activeProgress = await RiderIncentiveProgress.find({
        riderId,
        status: 'active',
        expiresAt: { $gt: new Date() }
      }).populate('templateId');

      // Update progress for order completion incentives
      for (const progress of activeProgress) {
        if (progress.template.type === 'orders_completed') {
          await this.updateProgress(riderId, progress._id, 'order_completed', {
            orderId: orderData._id,
            orderData: {
              id: orderData._id,
              status: orderData.status,
              amount: orderData.amount || orderData.total
            }
          });
        }
      }

      return activeProgress;
    } catch (error) {
      console.error('Error updating progress on order:', error);
      throw error;
    }
  }

  /**
   * Check and complete incentives
   */
  static async checkIncentiveCompletion(riderId, progressId) {
    try {
      const progress = await RiderIncentiveProgress.findById(progressId)
        .populate('templateId');
      
      if (!progress) {
        throw new Error('Progress record not found');
      }

      // Check if completed and not yet claimed
      if (progress.status === 'completed' && !progress.claimed && !progress.isExpired) {
        // Award the incentive
        await this.awardIncentive(riderId, progressId);
        
        // Send notification (implementation depends on notification system)
        await this.sendIncentiveNotification(riderId, progress);
        
        return { completed: true, progress };
      }

      return { completed: false, progress };
    } catch (error) {
      console.error('Error checking incentive completion:', error);
      throw error;
    }
  }

  /**
   * Award incentive reward to rider
   */
  static async awardIncentive(riderId, progressId) {
    try {
      const progress = await RiderIncentiveProgress.findById(progressId)
        .populate('templateId');
      
      if (!progress) {
        throw new Error('Progress record not found');
      }

      // Mark as claimed
      await progress.claimReward();
      await progress.save();

      // Add reward to rider's wallet
      await this.addRewardToWallet(riderId, progress.rewardAmount, progress.template.name);

      // Create earning record
      await this.createIncentiveEarning(riderId, progress);

      return progress;
    } catch (error) {
      console.error('Error awarding incentive:', error);
      throw error;
    }
  }

  /**
   * Add reward to rider's wallet
   */
  static async addRewardToWallet(riderId, amount, incentiveName) {
    try {
      let wallet = await RiderWallet.findOne({ riderId });
      
      if (!wallet) {
        // Create wallet if it doesn't exist
        wallet = new RiderWallet({
          riderId,
          balance: 0,
          totalEarnings: 0,
          totalWithdrawals: 0
        });
      }

      // Add to balance and earnings
      wallet.balance += amount;
      wallet.totalEarnings += amount;
      
      // Add transaction record
      wallet.transactions.push({
        type: 'credit',
        amount,
        description: `Incentive: ${incentiveName}`,
        timestamp: new Date(),
        status: 'completed'
      });

      await wallet.save();
      return wallet;
    } catch (error) {
      console.error('Error adding reward to wallet:', error);
      throw error;
    }
  }

  /**
   * Create earning record for incentive
   */
  static async createIncentiveEarning(riderId, progress) {
    try {
      const earning = new RiderEarning({
        riderId,
        orderId: null, // Not associated with a specific order
        restaurantId: null,
        deliveryFee: 0,
        commission: 0,
        incentive: progress.rewardAmount,
        penalty: 0,
        totalEarning: progress.rewardAmount,
        distance: 0,
        orderDate: progress.completedAt || new Date(),
        status: 'completed',
        adjustmentType: 'incentive',
        originalAmount: 0,
        adjustedAmount: progress.rewardAmount,
        relatedIncentives: [{
          templateId: progress.templateId,
          progressContribution: progress.targetProgress,
          timestamp: new Date()
        }]
      });

      await earning.save();
      return earning;
    } catch (error) {
      console.error('Error creating incentive earning:', error);
      throw error;
    }
  }

  /**
   * Get rider data for progress calculation
   */
  static async getRiderData(riderId) {
    try {
      const rider = await User.findById(riderId);
      if (!rider) {
        throw new Error('Rider not found');
      }

      // Get completed orders count
      const completedOrders = await Order.countDocuments({
        riderId,
        status: 'Delivered'
      });

      // Get total earnings
      const earnings = await RiderEarning.find({ riderId });
      const totalEarnings = earnings.reduce((sum, earning) => sum + earning.totalEarning, 0);

      // Get online hours (simplified - would need proper tracking)
      const onlineHours = rider.onlineHours || 0;

      // Get current rating
      const currentRating = rider.currentRating || 0;

      return {
        completedOrders,
        totalEarnings,
        onlineHours,
        currentRating,
        lastLogin: rider.lastLogin
      };
    } catch (error) {
      console.error('Error getting rider data:', error);
      throw error;
    }
  }

  /**
   * Auto-assign incentives to riders
   */
  static async assignIncentivesToRiders(templateId, riderIds = []) {
    try {
      const template = await IncentiveTemplate.findById(templateId);
      if (!template || !template.autoAssign) {
        return;
      }

      // If no specific riders provided, get all eligible riders
      if (riderIds.length === 0) {
        const allRiders = await User.find({ 
          role: 'rider', 
          isBlocked: false,
          isOnline: true 
        });
        riderIds = allRiders.map(rider => rider._id);
      }

      // Create progress records for eligible riders
      const assignments = [];
      for (const riderId of riderIds) {
        try {
          const progress = await this.createProgressRecord(riderId, template);
          assignments.push({
            riderId,
            templateId,
            progressId: progress._id
          });
        } catch (error) {
          console.error(`Failed to assign incentive to rider ${riderId}:`, error);
        }
      }

      return assignments;
    } catch (error) {
      console.error('Error assigning incentives to riders:', error);
      throw error;
    }
  }

  /**
   * Send notification for incentive completion
   */
  static async sendIncentiveNotification(riderId, progress) {
    try {
      // Implementation depends on notification system
      // This would integrate with the existing notification system
      console.log(`Incentive completed for rider ${riderId}: ${progress.template.name}`);
      
      // TODO: Integrate with notification service
      // await NotificationService.sendIncentiveCompleted(riderId, progress);
    } catch (error) {
      console.error('Error sending incentive notification:', error);
    }
  }

  /**
   * Get incentive statistics
   */
  static async getIncentiveStats() {
    try {
      const totalTemplates = await IncentiveTemplate.countDocuments({ isActive: true });
      const totalProgress = await RiderIncentiveProgress.countDocuments();
      const completedProgress = await RiderIncentiveProgress.countDocuments({ status: 'completed' });
      const claimedProgress = await RiderIncentiveProgress.countDocuments({ status: 'claimed' });
      const expiredProgress = await RiderIncentiveProgress.countDocuments({ status: 'expired' });

      const totalRewards = await RiderIncentiveProgress.aggregate([
        { $group: { _id: null, totalRewardAmount: { $sum: '$rewardAmount' } } }
      ]);

      return {
        totalTemplates,
        totalProgress,
        completedProgress,
        claimedProgress,
        expiredProgress,
        totalRewards: totalRewards[0]?.totalRewardAmount || 0,
        completionRate: totalProgress > 0 ? (completedProgress / totalProgress) * 100 : 0,
        claimRate: completedProgress > 0 ? (claimedProgress / completedProgress) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting incentive stats:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired progress records
   */
  static async cleanupExpiredRecords() {
    try {
      const result = await RiderIncentiveProgress.cleanupExpired();
      console.log(`Cleaned up ${result.deletedCount} expired incentive records`);
      return result;
    } catch (error) {
      console.error('Error cleaning up expired records:', error);
      throw error;
    }
  }
}

export default IncentiveService;
