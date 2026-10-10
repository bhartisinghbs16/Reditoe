/**
 * Services Initialization
 * Initializes and starts all background services
 */
import PayoutScheduler from './payoutScheduler.js';
import PaymentGatewayService from './paymentGatewayService.js';

class ServicesManager {
  constructor() {
    this.scheduler = PayoutScheduler;
    this.paymentGateway = PaymentGatewayService;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Services already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing financial services...');

      // Initialize Payment Gateway Service
      await this.paymentGateway.init();
      console.log('✅ Payment Gateway Service initialized');

      // Payout Scheduler is auto-initialized in constructor
      console.log('✅ Payout Scheduler initialized');

      this.isInitialized = true;
      console.log('🎉 All financial services initialized successfully!');

      // Log scheduler status
      const schedulerStatus = this.scheduler.getSchedulerStatus();
      console.log('📅 Scheduler Status:', {
        isRunning: schedulerStatus.isRunning,
        activeJobs: schedulerStatus.totalJobs,
        jobs: schedulerStatus.jobs.map(job => `${job.name} (${job.running ? 'running' : 'stopped'})`),
      });

      // Log payment gateway status
      const gatewayStatus = this.paymentGateway.getGatewayStatus();
      console.log('💳 Payment Gateway Status:', gatewayStatus);

    } catch (error) {
      console.error('❌ Failed to initialize services:', error);
      throw error;
    }
  }

  async shutdown() {
    try {
      console.log('🛑 Shutting down financial services...');

      // Stop scheduler
      this.scheduler.stopAll();
      console.log('✅ Payout Scheduler stopped');

      this.isInitialized = false;
      console.log('🔴 All financial services shut down');

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      scheduler: this.scheduler.getSchedulerStatus(),
      paymentGateway: this.paymentGateway.getGatewayStatus(),
    };
  }

  async getUpcomingSettlements() {
    return await this.scheduler.getUpcomingSettlements();
  }

  async getExecutionLogs() {
    return await this.scheduler.getExecutionLogs();
  }
}

// Create and export singleton instance
const servicesManager = new ServicesManager();

// Auto-initialize if this file is run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  servicesManager.initialize().catch(console.error);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Received SIGINT, shutting down gracefully...');
  await servicesManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 Received SIGTERM, shutting down gracefully...');
  await servicesManager.shutdown();
  process.exit(0);
});

export default servicesManager;
