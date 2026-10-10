/**
 * Auto Settlement Service
 * Handles automatic settlement calculations and processing
 */
import FinancialTransaction from '../models/FinancialTransaction.js';
import VendorSettlement from '../models/VendorSettlement.js';
import Payout from '../models/Payout.js';
import Order from '../models/Order.js';
import Restaurant from '../models/Restaurant.js';
import Settings from '../models/Settings.js';
import mongoose from 'mongoose';
import { deriveOrderNumberFromId } from '../models/Order.js';
import { settleOrder, chargesFor } from './vendorChargesService.js';

class SettlementService {
  constructor() {
    this.isProcessing = false;
  }

  /**
   * Calculate vendor payable amount from orders
   */
  async calculateVendorPayable(restaurantId, startDate, endDate) {
    try {
      // Get restaurant details
      const restaurant = await Restaurant.findById(restaurantId);
      if (!restaurant) {
        throw new Error('Restaurant not found');
      }

      /**
       * The terms are this restaurant's own, not the platform's.
       *
       * Every vendor is negotiated with separately - one on a promotional
       * commission, another with packing waived - so an admin who changes one
       * restaurant's commission changes what that restaurant is paid, and
       * nobody else's. Previously the figure came from a platform-wide
       * setting and the per-vendor one was collected on screen and ignored.
       */
      const settings = await Settings.getSettings();
      /**
       * What the platform charges everyone, handed to the terms so a
       * restaurant whose own terms have never been set keeps being settled
       * exactly as it was yesterday.
       */
      const platform = {
        gstEnabled: settings.taxConfiguration.gst.enabled,
        gstPercent: settings.taxConfiguration.gst.enabled
          ? settings.taxConfiguration.gst.percentage
          : 0,
      };
      const terms = chargesFor(restaurant, platform);

      // Get orders in the period
      const orders = await Order.find({
        restaurantId,
        createdAt: { $gte: startDate, $lte: endDate },
        status: { $in: ['Delivered', 'Cancelled'] }
      }).populate('foodItems.foodItemId');

      if (orders.length === 0) {
        return {
          items: [],
          summary: {
            totalOrders: 0,
            grossRevenue: 0,
            totalCommission: 0,
            totalGST: 0,
            totalPlatformFee: 0,
            totalPackaging: 0,
            totalVendorFundedDiscount: 0,
            totalPenalties: 0,
            totalAdjustments: 0,
            netPayable: 0,
            tdsDeducted: 0,
            finalAmount: 0,
          }
        };
      }

      // Check for already settled orders
      const settledOrderIds = await FinancialTransaction.find({
        'settlementInfo.isSettlement': true,
        restaurantId
      }).distinct('orderId');

      const unsettledOrders = orders.filter(order => 
        !settledOrderIds.includes(order._id.toString())
      );

      // Calculate settlement items
      const settlementItems = [];
      let totalGrossRevenue = 0;
      let totalCommission = 0;
      let totalGST = 0;
      let totalPlatformFee = 0;
      let totalPenalties = 0;
      let totalPackaging = 0;
      let totalVendorDiscount = 0;

      for (const order of unsettledOrders) {
        /**
         * A discount the vendor put their name to is theirs to fund. One the
         * platform ran is the platform's, and taking it out of the vendor's
         * money would make them pay for our marketing.
         */
        const discountBorneByVendor =
          order.discountFundedBy === 'vendor' ? order.discount || 0 : 0;

        const settled = settleOrder({ restaurant, order, discountBorneByVendor, platform });

        // grossAmount = vendor's food revenue only (subtotal), NOT order.total
        // order.total includes delivery fee, tip, platform fee — money that never belonged to vendor
        const grossAmount = settled.foodTotal;
        // Commission and its GST are both the platform's take; the vendor's
        // statement shows them apart, the settlement total counts them together.
        const commissionAmount = settled.deductions.commission + settled.deductions.commissionGst;
        const gstAmount = settled.deductions.gst;
        const convenienceAmount =
          settled.deductions.convenience + settled.deductions.convenienceGst;
        const packagingAmount = -settled.deductions.packing;
        const packagingGstAmount = settled.deductions.packingGst;
        // platformFee stays with the platform — not deducted from vendor earning
        const platformFeeAmount = 0;

        const netAmount = settled.payout;

        // Cancellation penalty (10% of food subtotal for cancelled orders)
        const cancellationPenalty = order.status === 'Cancelled' ? 
          Math.round(grossAmount * 0.1) : 0;

        const finalNetAmount = netAmount - cancellationPenalty;

        settlementItems.push({
          orderId: order._id,
          orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
          orderDate: order.createdAt,
          grossAmount,
          commissionAmount,
          gstAmount,
          packagingAmount,
          packagingGstAmount,
          vendorFundedDiscount: settled.deductions.vendorFundedDiscount,
          // The convenience fee is the platform's, so it rides in the same
          // column the platform fee already had.
          platformFee: platformFeeAmount + convenienceAmount,
          netAmount: finalNetAmount,
          cancellationPenalty,
          adjustmentAmount: 0,
          adjustmentReason: cancellationPenalty > 0 ? 'Order cancellation penalty' : undefined,
          // What the vendor reads on their statement, line by line.
          breakdown: settled.lines,
        });

        totalGrossRevenue += grossAmount;
        totalCommission += commissionAmount;
        totalGST += gstAmount + packagingGstAmount;
        totalPackaging += packagingAmount;
        totalVendorDiscount += settled.deductions.vendorFundedDiscount;
        totalPlatformFee += convenienceAmount;
        totalPenalties += cancellationPenalty;
      }

      // Calculate summary
      /**
       * Packing was collected from the customer on the vendor's behalf, so it
       * is added back rather than deducted; its GST has already been counted
       * into totalGST above and goes to the authority.
       */
      const netPayable =
        totalGrossRevenue +
        totalPackaging -
        totalCommission -
        totalGST -
        totalVendorDiscount -
        totalPenalties;
      const tdsDeducted = Math.round((totalCommission + totalPlatformFee) * 0.02);
      const finalAmount = Math.max(0, netPayable - tdsDeducted);

      return {
        items: settlementItems,
        summary: {
          totalOrders: settlementItems.length,
          grossRevenue: totalGrossRevenue,
          totalCommission: totalCommission,
          totalGST: totalGST,
          totalPlatformFee: totalPlatformFee,
          totalPackaging: totalPackaging,
          totalVendorFundedDiscount: totalVendorDiscount,
          totalPenalties: totalPenalties,
          totalAdjustments: 0,
          terms,
          netPayable,
          tdsDeducted,
          finalAmount,
        }
      };
    } catch (error) {
      console.error('Error calculating vendor payable:', error);
      throw error;
    }
  }

  /**
   * Generate automatic settlement for a vendor
   */
  async generateSettlement(restaurantId, startDate, endDate, options = {}) {
    try {
      // Check if settlement already exists for this period
      const existingSettlement = await VendorSettlement.findOne({
        restaurantId,
        'settlementPeriod.startDate': startDate,
        'settlementPeriod.endDate': endDate,
      });

      if (existingSettlement) {
        throw new Error('Settlement already exists for this period');
      }

      // Get restaurant and vendor info
      const restaurant = await Restaurant.findById(restaurantId).populate('owner');
      if (!restaurant || !restaurant.owner) {
        throw new Error('Restaurant or vendor not found');
      }

      // Calculate settlement details
      const { items, summary } = await this.calculateVendorPayable(
        restaurantId, startDate, endDate
      );

      if (items.length === 0) {
        throw new Error('No orders to settle in this period');
      }

      // Create settlement
      const settlement = new VendorSettlement({
        vendorId: restaurant.owner._id,
        restaurantId,
        settlementPeriod: {
          startDate,
          endDate,
        },
        status: 'pending',
        items,
        summary,
        bankDetails: restaurant.settlementInfo?.bankDetails || {
          accountHolderName: restaurant.owner.firstName && restaurant.owner.lastName ?
            `${restaurant.owner.firstName} ${restaurant.owner.lastName}` : 'Vendor Name',
          accountNumber: '****1234',
          bankName: 'Bank Name',
          ifsc: 'BANK0000',
        },
        autoGenerated: options.autoGenerated || true,
        dueDate: new Date(new Date(endDate).getTime() + 3 * 24 * 60 * 60 * 1000),
      });

      await settlement.save();

      // Create financial transactions for each order
      const transactions = [];
      for (const item of items) {
        const transaction = new FinancialTransaction({
          type: 'settlement',
          orderId: item.orderId,
          restaurantId,
          amount: item.grossAmount,
          commissionAmount: item.commissionAmount,
          vendorAmount: item.netAmount,
          gstAmount: item.gstAmount,
          platformFee: item.platformFee,
          status: 'pending',
          settlementInfo: {
            isSettlement: true,
            settlementId: settlement._id,
            settlementDate: new Date(),
          },
          processedAt: new Date(),
          notes: `Auto-generated settlement for order ${item.orderNumber}`,
        });
        await transaction.save();
        transactions.push(transaction);
      }

      // Create payout record
      const payout = new Payout({
        restaurantId,
        orderIds: items.map(item => item.orderId),
        grossAmount: summary.grossRevenue,
        commissionAmount: summary.totalCommission,
        netAmount: summary.finalAmount,
        status: 'pending',
        payoutMethod: 'bank',
        notes: `Auto settlement ${settlement.settlementNumber}`,
      });

      await payout.save();

      return {
        settlement,
        transactions,
        payout,
      };
    } catch (error) {
      console.error('Error generating settlement:', error);
      throw error;
    }
  }

  /**
   * Process pending settlements
   */
  async processPendingSettlements() {
    if (this.isProcessing) {
      console.log('Settlement processing already in progress');
      return;
    }

    this.isProcessing = true;
    try {
      const pendingSettlements = await VendorSettlement.find({
        status: 'approved',
        'paymentInfo.transactionId': { $exists: false },
      }).populate('vendorId', 'name email')
        .populate('restaurantId', 'name');

      console.log(`Found ${pendingSettlements.length} settlements to process`);

      for (const settlement of pendingSettlements) {
        try {
          await this.processSingleSettlement(settlement);
        } catch (error) {
          console.error(`Error processing settlement ${settlement._id}:`, error);
          settlement.status = 'failed';
          settlement.failureReason = error.message;
          settlement.retryCount = (settlement.retryCount || 0) + 1;
          settlement.nextRetryAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour later
          await settlement.save();
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single settlement
   */
  async processSingleSettlement(settlement) {
    // In a real implementation, this would integrate with payment gateway
    // For now, we'll simulate the payment processing
    
    const transactionId = `BANK_TXN_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const utrNumber = `UTR${Date.now()}${Math.floor(Math.random() * 10000)}`;

    // Update settlement
    settlement.status = 'paid';
    settlement.paymentInfo = {
      transactionId,
      paymentDate: new Date(),
      paymentMethod: 'bank_transfer',
      utrNumber,
      referenceNumber: `REF${settlement.settlementNumber}`,
    };
    settlement.processingInfo = {
      processedBy: null, // System processed
      processedAt: new Date(),
      processingNotes: 'Auto-processed by settlement system',
    };

    await settlement.save();

    // Update related financial transactions
    await FinancialTransaction.updateMany(
      { 'settlementInfo.settlementId': settlement._id },
      { 
        status: 'completed',
        processedAt: new Date(),
        'settlementInfo.settlementDate': new Date(),
      }
    );

    // Update payout record
    await Payout.findOneAndUpdate(
      { 
        restaurantId: settlement.restaurantId,
        orderIds: { $in: settlement.items.map(item => item.orderId) },
      },
      {
        status: 'completed',
        transactionId,
        notes: `Processed via settlement ${settlement.settlementNumber}`,
      }
    );

    console.log(`Settlement ${settlement.settlementNumber} processed successfully`);
    return settlement;
  }

  /**
   * Retry failed settlements
   */
  async retryFailedSettlements() {
    const failedSettlements = await VendorSettlement.find({
      status: 'failed',
      retryCount: { $lt: 3 },
      nextRetryAt: { $lte: new Date() },
    });

    console.log(`Found ${failedSettlements.length} failed settlements to retry`);

    for (const settlement of failedSettlements) {
      try {
        settlement.status = 'approved';
        settlement.failureReason = undefined;
        await settlement.save();
        
        await this.processSingleSettlement(settlement);
        console.log(`Successfully retried settlement ${settlement.settlementNumber}`);
      } catch (error) {
        console.error(`Retry failed for settlement ${settlement._id}:`, error);
        settlement.retryCount += 1;
        settlement.nextRetryAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours later
        await settlement.save();
      }
    }
  }

  /**
   * Get settlement statistics
   */
  async getSettlementStats(filters = {}) {
    const matchStage = {};
    
    if (filters.startDate || filters.endDate) {
      matchStage.createdAt = {};
      if (filters.startDate) matchStage.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) matchStage.createdAt.$lte = new Date(filters.endDate);
    }
    
    if (filters.restaurantId) {
      matchStage.restaurantId = new mongoose.Types.ObjectId(filters.restaurantId);
    }

    const stats = await VendorSettlement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$summary.finalAmount' },
          totalOrders: { $sum: '$summary.totalOrders' },
        }
      }
    ]);

    const totalStats = await VendorSettlement.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalSettlements: { $sum: 1 },
          totalAmount: { $sum: '$summary.finalAmount' },
          totalCommission: { $sum: '$summary.totalCommission' },
          totalGST: { $sum: '$summary.totalGST' },
          totalPlatformFee: { $sum: '$summary.totalPlatformFee' },
          totalOrders: { $sum: '$summary.totalOrders' },
        }
      }
    ]);

    return {
      byStatus: stats,
      totals: totalStats[0] || {
        totalSettlements: 0,
        totalAmount: 0,
        totalCommission: 0,
        totalGST: 0,
        totalPlatformFee: 0,
        totalOrders: 0,
      }
    };
  }
}

export default new SettlementService();
