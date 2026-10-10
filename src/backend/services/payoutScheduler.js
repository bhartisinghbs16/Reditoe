/**
 * Payout Scheduler Service
 * Handles automated payout scheduling and processing
 */
import cron from 'node-cron';
import SettlementService from './settlementService.js';
import SettlementRule from '../models/SettlementRule.js';
import VendorSettlement from '../models/VendorSettlement.js';
import Restaurant from '../models/Restaurant.js';
import Settings from '../models/Settings.js';
import mongoose from 'mongoose';

class PayoutScheduler {
  constructor() {
    this.isRunning = false;
    this.scheduledJobs = new Map();
    this.init();
  }

  /**
   * Initialize the scheduler
   */
  async init() {
    console.log('Initializing Payout Scheduler...');
    
    // Schedule daily settlement generation at 2 AM
    this.scheduleJob('daily-settlement', '0 2 * * *', async () => {
      await this.generateDailySettlements();
    });

    // Schedule settlement processing at 9 AM and 5 PM
    this.scheduleJob('process-settlements-morning', '0 9 * * *', async () => {
      await SettlementService.processPendingSettlements();
    });

    this.scheduleJob('process-settlements-evening', '0 17 * * *', async () => {
      await SettlementService.processPendingSettlements();
    });

    // Schedule retry for failed settlements at 11 AM
    this.scheduleJob('retry-failed-settlements', '0 11 * * *', async () => {
      await SettlementService.retryFailedSettlements();
    });

    // Schedule weekly settlement generation on Sundays at 3 AM
    this.scheduleJob('weekly-settlement', '0 3 * * 0', async () => {
      await this.generateWeeklySettlements();
    });

    console.log('Payout Scheduler initialized successfully');
  }

  /**
   * Schedule a cron job
   */
  scheduleJob(name, schedule, task) {
    if (this.scheduledJobs.has(name)) {
      this.scheduledJobs.get(name).stop();
    }

    const job = cron.schedule(schedule, task, {
      scheduled: true,
      timezone: 'Asia/Kolkata',
    });

    this.scheduledJobs.set(name, job);
    console.log(`Scheduled job: ${name} with schedule: ${schedule}`);
  }

  /**
   * Generate daily settlements for all restaurants
   */
  async generateDailySettlements() {
    if (this.isRunning) {
      console.log('Daily settlement generation already in progress');
      return;
    }

    this.isRunning = true;
    console.log('Starting daily settlement generation...');
    
    try {
      // Get all active settlement rules with daily frequency
      const dailyRules = await SettlementRule.find({
        frequency: 'daily',
        isActive: true,
      }).populate('restaurantId');

      console.log(`Found ${dailyRules.length} daily settlement rules`);

      for (const rule of dailyRules) {
        try {
          await this.processSettlementRule(rule, 'daily');
        } catch (error) {
          console.error(`Error processing daily settlement for restaurant ${rule.restaurantId._id}:`, error);
        }
      }

      console.log('Daily settlement generation completed');
    } catch (error) {
      console.error('Error in daily settlement generation:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Generate weekly settlements for all restaurants
   */
  async generateWeeklySettlements() {
    if (this.isRunning) {
      console.log('Weekly settlement generation already in progress');
      return;
    }

    this.isRunning = true;
    console.log('Starting weekly settlement generation...');
    
    try {
      // Get all active settlement rules with weekly frequency
      const weeklyRules = await SettlementRule.find({
        frequency: 'weekly',
        isActive: true,
      }).populate('restaurantId');

      console.log(`Found ${weeklyRules.length} weekly settlement rules`);

      for (const rule of weeklyRules) {
        try {
          await this.processSettlementRule(rule, 'weekly');
        } catch (error) {
          console.error(`Error processing weekly settlement for restaurant ${rule.restaurantId._id}:`, error);
        }
      }

      console.log('Weekly settlement generation completed');
    } catch (error) {
      console.error('Error in weekly settlement generation:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Process a single settlement rule
   */
  async processSettlementRule(rule, frequency) {
    const restaurant = rule.restaurantId;
    const now = new Date();
    
    // Calculate settlement period
    let startDate, endDate;
    
    if (frequency === 'daily') {
      // For daily: previous day
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      startDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());
      endDate = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1);
    } else if (frequency === 'weekly') {
      // For weekly: last week
      const lastWeekStart = new Date(now);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7 - lastWeekStart.getDay());
      startDate = new Date(lastWeekStart.getFullYear(), lastWeekStart.getMonth(), lastWeekStart.getDate());
      
      const lastWeekEnd = new Date(startDate);
      lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
      endDate = lastWeekEnd;
    }

    // Check if settlement already exists for this period
    const existingSettlement = await VendorSettlement.findOne({
      restaurantId: restaurant._id,
      'settlementPeriod.startDate': startDate,
      'settlementPeriod.endDate': endDate,
    });

    if (existingSettlement) {
      console.log(`Settlement already exists for ${restaurant.name} for period ${startDate.toISOString()} to ${endDate.toISOString()}`);
      return;
    }

    // Check minimum threshold
    const { summary } = await SettlementService.calculateVendorPayable(
      restaurant._id, startDate, endDate
    );

    if (summary.finalAmount < rule.minimumThreshold) {
      console.log(`Settlement amount ${summary.finalAmount} below threshold ${rule.minimumThreshold} for ${restaurant.name}`);
      return;
    }

    // Generate settlement
    const settlement = await SettlementService.generateSettlement(
      restaurant._id, startDate, endDate, {
        autoGenerated: true,
      }
    );

    console.log(`Generated ${frequency} settlement for ${restaurant.name}: ${settlement.settlement.settlementNumber}`);

    // Auto-approve if configured
    if (rule.autoProcess) {
      try {
        await settlement.settlement.approve(null, 'Auto-approved by system');
        console.log(`Auto-approved settlement ${settlement.settlement.settlementNumber}`);
      } catch (error) {
        console.error(`Error auto-approving settlement ${settlement.settlement._id}:`, error);
      }
    }

    // Send notification if configured
    if (rule.notifyVendor && rule.notifyEmail) {
      // In a real implementation, this would send an email
      console.log(`Would send settlement notification to ${rule.notifyEmail}`);
    }
  }

  /**
   * Generate settlement for a specific restaurant on demand
   */
  async generateRestaurantSettlement(restaurantId, frequency, startDate, endDate) {
    try {
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant not found');
      }

      // Check if settlement already exists
      const existingSettlement = await VendorSettlement.findOne({
        restaurantId,
        'settlementPeriod.startDate': startDate,
        'settlementPeriod.endDate': endDate,
      });

      if (existingSettlement) {
        throw new Error('Settlement already exists for this period');
      }

      // Generate settlement
      const settlement = await SettlementService.generateSettlement(
        restaurantId, startDate, endDate, {
          autoGenerated: false,
        }
      );

      console.log(`Generated manual settlement for ${restaurant.name}: ${settlement.settlement.settlementNumber}`);
      return settlement;
    } catch (error) {
      console.error('Error generating restaurant settlement:', error);
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  getSchedulerStatus() {
    const jobs = [];
    for (const [name, job] of this.scheduledJobs) {
      jobs.push({
        name,
        running: job.getStatus() === 'scheduled',
        nextRun: job.getNextDates ? job.getNextDates(1)[0] : null,
      });
    }

    return {
      isRunning: this.isRunning,
      jobs,
      totalJobs: this.scheduledJobs.size,
    };
  }

  /**
   * Stop all scheduled jobs
   */
  stopAll() {
    console.log('Stopping all scheduled jobs...');
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
      console.log(`Stopped job: ${name}`);
    }
    this.scheduledJobs.clear();
  }

  /**
   * Restart scheduler
   */
  async restart() {
    this.stopAll();
    await this.init();
  }

  /**
   * Get upcoming settlements
   */
  async getUpcomingSettlements() {
    const rules = await SettlementRule.find({ isActive: true })
      .populate('restaurantId', 'name')
      .sort({ frequency: 1, restaurantId: 1 });

    const upcoming = [];
    const now = new Date();

    for (const rule of rules) {
      let nextSettlementDate;

      if (rule.frequency === 'daily') {
        // Next settlement is tomorrow
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        nextSettlementDate = tomorrow;
      } else if (rule.frequency === 'weekly') {
        // Next settlement is next Sunday
        const nextSunday = new Date(now);
        nextSunday.setDate(nextSunday.getDate() + (7 - nextSunday.getDay()));
        nextSettlementDate = nextSunday;
      }

      upcoming.push({
        restaurant: rule.restaurantId.name,
        restaurantId: rule.restaurantId._id,
        frequency: rule.frequency,
        nextSettlementDate,
        minimumThreshold: rule.minimumThreshold,
        autoProcess: rule.autoProcess,
      });
    }

    return upcoming;
  }

  /**
   * Get settlement execution logs
   */
  async getExecutionLogs(limit = 50) {
    // In a real implementation, this would query a logs collection
    // For now, return mock data
    return {
      logs: [
        {
          timestamp: new Date(),
          type: 'daily_settlement',
          status: 'completed',
          message: 'Generated 5 daily settlements',
          settlementsProcessed: 5,
        },
        {
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          type: 'process_settlements',
          status: 'completed',
          message: 'Processed 3 pending settlements',
          settlementsProcessed: 3,
        },
      ],
      total: 2,
    };
  }
}

export default new PayoutScheduler();
