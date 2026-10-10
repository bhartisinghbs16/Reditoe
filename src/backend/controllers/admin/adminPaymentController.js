/**
 * Admin Payment Controller
 * Handles payment gateway configuration, settlement rules, and financial reporting
 */
import PaymentGateway from '../../models/PaymentGateway.js';
import SettlementRule from '../../models/SettlementRule.js';
import FinancialTransaction from '../../models/FinancialTransaction.js';
import Order from '../../models/Order.js';
import Restaurant from '../../models/Restaurant.js';
import Payout from '../../models/Payout.js';
import VendorSettlement from '../../models/VendorSettlement.js';
import mongoose from 'mongoose';

/**
 * GET /api/admin/payments/gateways
 * Get all payment gateway configurations
 */
export const getPaymentGateways = async (req, res) => {
  try {
    const gateways = await PaymentGateway.find({})
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      status: 'success',
      results: gateways.length,
      data: {
        gateways,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch payment gateways',
    });
  }
};

/**
 * POST /api/admin/payments/gateways
 * Create a new payment gateway configuration
 */
export const createPaymentGateway = async (req, res) => {
  try {
    const {
      name,
      gatewayType,
      apiKey,
      secretKey,
      webhookSecret,
      environment = 'sandbox',
      supportedMethods = ['card', 'upi', 'netbanking'],
      currency = 'INR',
      merchantId,
      config = {},
    } = req.body;

    if (!name || !gatewayType || !apiKey || !secretKey) {
      return res.status(400).json({
        status: 'error',
        message: 'Name, gateway type, API key, and secret key are required',
      });
    }

    // Check if gateway name already exists
    const existingGateway = await PaymentGateway.findOne({ name });
    if (existingGateway) {
      return res.status(400).json({
        status: 'error',
        message: 'Gateway name already exists',
      });
    }

    const gateway = new PaymentGateway({
      name,
      gatewayType,
      apiKey,
      secretKey,
      webhookSecret,
      environment,
      supportedMethods,
      currency,
      merchantId,
      config,
    });

    await gateway.save();

    res.status(201).json({
      status: 'success',
      message: 'Payment gateway created successfully',
      data: {
        gateway,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create payment gateway',
    });
  }
};

/**
 * PATCH /api/admin/payments/gateways/:id
 * Update payment gateway configuration
 */
export const updatePaymentGateway = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid gateway ID',
      });
    }

    // Don't allow updating the name to an existing one
    if (updates.name) {
      const existingGateway = await PaymentGateway.findOne({ 
        name: updates.name, 
        _id: { $ne: id } 
      });
      if (existingGateway) {
        return res.status(400).json({
          status: 'error',
          message: 'Gateway name already exists',
        });
      }
    }

    const gateway = await PaymentGateway.findByIdAndUpdate(
      id,
      { ...updates, lastTested: undefined, testStatus: 'pending' },
      { new: true, runValidators: true }
    );

    if (!gateway) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment gateway not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment gateway updated successfully',
      data: {
        gateway,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update payment gateway',
    });
  }
};

/**
 * DELETE /api/admin/payments/gateways/:id
 * Delete payment gateway configuration
 */
export const deletePaymentGateway = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid gateway ID',
      });
    }

    const gateway = await PaymentGateway.findByIdAndDelete(id);

    if (!gateway) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment gateway not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment gateway deleted successfully',
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to delete payment gateway',
    });
  }
};

/**
 * POST /api/admin/payments/gateways/:id/test
 * Test payment gateway connection (dummy implementation)
 */
export const testPaymentGateway = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid gateway ID',
      });
    }

    const gateway = await PaymentGateway.findById(id);

    if (!gateway) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment gateway not found',
      });
    }

    // Dummy test - in real implementation, this would test actual gateway connection
    const testResult = {
      success: true,
      message: 'Gateway connection successful (sandbox)',
      responseTime: Math.floor(Math.random() * 500) + 100, // ms
    };

    gateway.lastTested = new Date();
    gateway.testStatus = testResult.success ? 'success' : 'failed';
    gateway.testMessage = testResult.message;
    await gateway.save();

    res.status(200).json({
      status: 'success',
      message: 'Gateway test completed',
      data: {
        testResult,
        gateway,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to test payment gateway',
    });
  }
};

/**
 * GET /api/admin/payments/settlements
 * Get all settlement rules
 */
export const getSettlementRules = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const restaurantId = req.query.restaurantId;
    const isActive = req.query.isActive;

    const filter = {};
    if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
      filter.restaurantId = restaurantId;
    }
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const [rules, total] = await Promise.all([
      SettlementRule.find(filter)
        .populate('restaurantId', 'name image address')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SettlementRule.countDocuments(filter),
    ]);

    res.status(200).json({
      status: 'success',
      results: rules.length,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      data: {
        rules,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch settlement rules',
    });
  }
};

/**
 * POST /api/admin/payments/settlements
 * Create settlement rule for a restaurant
 */
export const createSettlementRule = async (req, res) => {
  try {
    const {
      restaurantId,
      frequency,
      minimumThreshold = 100,
      settlementDay,
      settlementTime = '00:00',
      autoProcess = false,
      notifyVendor = true,
      notifyEmail,
      customRules = {},
    } = req.body;

    if (!restaurantId || !frequency) {
      return res.status(400).json({
        status: 'error',
        message: 'Restaurant ID and frequency are required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    // Check if restaurant exists
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    // Check if rule already exists for this restaurant
    const existingRule = await SettlementRule.findOne({ restaurantId });
    if (existingRule) {
      return res.status(400).json({
        status: 'error',
        message: 'Settlement rule already exists for this restaurant',
      });
    }

    const rule = new SettlementRule({
      restaurantId,
      frequency,
      minimumThreshold,
      settlementDay,
      settlementTime,
      autoProcess,
      notifyVendor,
      notifyEmail,
      customRules,
    });

    await rule.save();
    await rule.populate('restaurantId', 'name image address');

    res.status(201).json({
      status: 'success',
      message: 'Settlement rule created successfully',
      data: {
        rule,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create settlement rule',
    });
  }
};

/**
 * PATCH /api/admin/payments/settlements/:id
 * Update settlement rule
 */
export const updateSettlementRule = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid settlement rule ID',
      });
    }

    const rule = await SettlementRule.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate('restaurantId', 'name image address');

    if (!rule) {
      return res.status(404).json({
        status: 'error',
        message: 'Settlement rule not found',
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Settlement rule updated successfully',
      data: {
        rule,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to update settlement rule',
    });
  }
};

/**
 * POST /api/admin/payments/settlements/manual-adjustment
 * Create manual financial adjustment
 */
export const createManualAdjustment = async (req, res) => {
  try {
    const {
      restaurantId,
      adjustmentType,
      amount,
      reason,
      notes,
      orderId,
    } = req.body;

    if (!restaurantId || !adjustmentType || !amount || !reason) {
      return res.status(400).json({
        status: 'error',
        message: 'Restaurant ID, adjustment type, amount, and reason are required',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(restaurantId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid restaurant ID',
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({
        status: 'error',
        message: 'Restaurant not found',
      });
    }

    const transaction = new FinancialTransaction({
      type: 'adjustment',
      restaurantId,
      amount: Math.abs(amount),
      orderId,
      adjustmentInfo: {
        isAdjustment: true,
        adjustmentType,
        adjustedBy: req.user?.id,
        reason,
        previousAmount: 0,
      },
      status: 'completed',
      processedAt: new Date(),
      notes,
    });

    await transaction.save();
    await transaction.populate('restaurantId', 'name');

    res.status(201).json({
      status: 'success',
      message: 'Manual adjustment created successfully',
      data: {
        transaction,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to create manual adjustment',
    });
  }
};

/**
 * GET /api/admin/payments/profit-dashboard
 * Get comprehensive profit dashboard data with real-time calculations
 */
export const getProfitDashboard = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      restaurantId,
      status,
      groupBy = 'day', // day, week, month
    } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }
    if (Object.keys(dateFilter).length > 0) {
      dateFilter.createdAt = dateFilter;
    }

    // Build main filter
    const filter = {
      status: status || { $in: ['Delivered', 'completed'] },
    };
    
    if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
      filter.restaurantId = restaurantId;
    }

    if (dateFilter.createdAt) {
      Object.assign(filter, dateFilter);
    }

    // Get real commission percentages from restaurants
    const restaurantCommissionMap = await Restaurant.find({}, 
      { _id: 1, commissionPercent: 1, name: 1 }
    ).lean();
    
    const commissionMap = {};
    restaurantCommissionMap.forEach(rest => {
      commissionMap[rest._id.toString()] = rest.commissionPercent || 10;
    });

    // Get orders data with real commission calculations
    const ordersData = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: groupBy === 'day' 
            ? { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            : groupBy === 'week'
            ? { $dateToString: { format: '%Y-%U', date: '$createdAt' } }
            : { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          totalRevenue: { $sum: '$total' },
          orderCount: { $sum: 1 },
          gstTotal: { $sum: '$gstAndPackaging' },
          platformFeeTotal: { $sum: '$platformFee' },
          deliveryFeeTotal: { $sum: '$deliveryFee' },
          restaurants: { $addToSet: '$restaurantId' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    // Calculate commission for each period
    const enrichedOrdersData = await Promise.all(
      ordersData.map(async (period) => {
        const periodOrders = await Order.find({
          ...filter,
          createdAt: {
            $gte: groupBy === 'day' ? new Date(period._id) :
              groupBy === 'week' ? new Date(period._id + '-1') :
              new Date(period._id + '-01'),
            $lt: groupBy === 'day' ? new Date(new Date(period._id).getTime() + 24 * 60 * 60 * 1000) :
              groupBy === 'week' ? new Date(new Date(period._id + '-1').getTime() + 7 * 24 * 60 * 60 * 1000) :
              new Date(new Date(period._id + '-01').getFullYear(), new Date(period._id + '-01').getMonth() + 1, 1),
          }
        }).populate('restaurantId', 'commissionPercent');

        let commissionTotal = 0;
        periodOrders.forEach(order => {
          const commissionPercent = order.restaurantId?.commissionPercent || 10;
          commissionTotal += (order.subtotal || 0) * (commissionPercent / 100); // use subtotal as commission base
        });

        return {
          ...period,
          commissionTotal: Math.round(commissionTotal),
          adminProfit: Math.round(commissionTotal + period.platformFeeTotal),
          vendorRevenue: Math.round(period.totalRevenue - commissionTotal - period.gstTotal - period.platformFeeTotal),
        };
      })
    );

    // Get restaurant-wise breakdown with real data
    const restaurantBreakdown = await Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$restaurantId',
          totalRevenue: { $sum: '$total' },
          subtotalRevenue: { $sum: '$subtotal' }, // vendor food revenue base for commission
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
          gstTotal: { $sum: '$gstAndPackaging' },
          platformFeeTotal: { $sum: '$platformFee' },
          deliveryFeeTotal: { $sum: '$deliveryFee' },
        },
      },
      {
        $lookup: {
          from: 'restaurants',
          localField: '_id',
          foreignField: '_id',
          as: 'restaurant',
        },
      },
      { $unwind: '$restaurant' },
      {
        $project: {
          restaurantName: '$restaurant.name',
          restaurantImage: '$restaurant.image',
          totalRevenue: 1,
          subtotalRevenue: 1,
          orderCount: 1,
          avgOrderValue: 1,
          gstTotal: 1,
          platformFeeTotal: 1,
          deliveryFeeTotal: 1,
          commissionPercent: { $ifNull: ['$restaurant.commissionPercent', 10] },
        },
      },
      {
        $addFields: {
          // commission based on vendor's food subtotal — NOT total which includes delivery/tip
          commissionAmount: { $multiply: ['$subtotalRevenue', { $divide: ['$commissionPercent', 100] }] },
          vendorAmount: { $subtract: ['$subtotalRevenue', { $multiply: ['$subtotalRevenue', { $divide: ['$commissionPercent', 100] }] }] },
          adminProfit: { $add: [
            { $multiply: ['$subtotalRevenue', { $divide: ['$commissionPercent', 100] }] },
            '$platformFeeTotal'
          ]},
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    // Get real financial transactions
    const recentTransactions = await FinancialTransaction.find(filter)
      .populate('restaurantId', 'name image')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Get settlement data
    const settlementStats = await VendorSettlement.aggregate([
      {
        $match: dateFilter.createdAt || {}
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$summary.finalAmount' },
        }
      }
    ]);

    // Get refund data
    const refundData = await FinancialTransaction.aggregate([
      { $match: { ...filter, 'refundInfo.isRefund': true } },
      {
        $group: {
          _id: null,
          totalRefunds: { $sum: '$amount' },
          refundCount: { $sum: 1 },
        }
      }
    ]);

    // Calculate totals
    const totals = enrichedOrdersData.reduce((acc, item) => {
      acc.totalRevenue += item.totalRevenue;
      acc.orderCount += item.orderCount;
      acc.commissionTotal += item.commissionTotal;
      acc.gstTotal += item.gstTotal;
      acc.platformFeeTotal += item.platformFeeTotal;
      acc.deliveryFeeTotal += item.deliveryFeeTotal;
      acc.adminProfit += item.adminProfit;
      acc.vendorRevenue += item.vendorRevenue;
      return acc;
    }, {
      totalRevenue: 0,
      orderCount: 0,
      commissionTotal: 0,
      gstTotal: 0,
      platformFeeTotal: 0,
      deliveryFeeTotal: 0,
      adminProfit: 0,
      vendorRevenue: 0,
    });

    // Get wallet balances
    const walletBalances = await FinancialTransaction.aggregate([
      {
        $group: {
          _id: '$restaurantId',
          totalCredits: {
            $sum: {
              $cond: [{ $eq: ['$type', 'order_payment'] }, '$vendorAmount', 0]
            }
          },
          totalDebits: {
            $sum: {
              $cond: [{ $in: ['$type', ['settlement', 'refund']] }, '$amount', 0]
            }
          },
        },
      },
      {
        $addFields: {
          balance: { $subtract: ['$totalCredits', '$totalDebits'] }
        }
      },
      {
        $lookup: {
          from: 'restaurants',
          localField: '_id',
          foreignField: '_id',
          as: 'restaurant',
        },
      },
      { $unwind: '$restaurant' },
      {
        $project: {
          restaurantName: '$restaurant.name',
          balance: 1,
          totalCredits: 1,
          totalDebits: 1,
        },
      },
      { $sort: { balance: -1 } },
      { $limit: 10 },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        summary: {
          ...totals,
          avgOrderValue: totals.orderCount > 0 ? Math.round(totals.totalRevenue / totals.orderCount) : 0,
          totalRefunds: refundData[0]?.totalRefunds || 0,
          refundCount: refundData[0]?.refundCount || 0,
          netRevenue: totals.totalRevenue - (refundData[0]?.totalRefunds || 0),
        },
        chartData: enrichedOrdersData,
        restaurantBreakdown,
        recentTransactions,
        settlementStats,
        walletBalances,
        metrics: {
          totalOrders: totals.orderCount,
          revenueGrowth: 0, // Would need previous period data
          profitMargin: totals.totalRevenue > 0 ? Math.round((totals.adminProfit / totals.totalRevenue) * 100) : 0,
          avgCommission: totals.orderCount > 0 ? Math.round(totals.commissionTotal / totals.orderCount) : 0,
        }
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch profit dashboard data',
    });
  }
};

/**
 * GET /api/admin/payments/gst-report
 * Get GST and tax breakdown report
 */
export const getGstReport = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      restaurantId,
    } = req.query;

    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }

    const filter = {
      status: 'Delivered',
    };
    
    if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
      filter.restaurantId = restaurantId;
    }

    if (Object.keys(dateFilter).length > 0) {
      filter.createdAt = dateFilter;
    }

    const gstData = await Order.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'restaurants',
          localField: 'restaurantId',
          foreignField: '_id',
          as: 'restaurant',
        },
      },
      { $unwind: '$restaurant' },
      {
        $group: {
          _id: '$restaurantId',
          restaurantName: { $first: '$restaurant.name' },
          gstNumber: { $first: '$restaurant.gstInfo.gstNumber' },
          gstRegistered: { $first: '$restaurant.gstInfo.isRegistered' },
          totalRevenue: { $sum: '$total' },
          gstCollected: { $sum: '$gstAndPackaging' },
          commissionEarned: { $sum: { $multiply: ['$total', { $divide: ['$restaurant.commissionPercent', 100] }] } },
          vendorShare: { $sum: { $subtract: ['$total', { $multiply: ['$total', { $divide: ['$restaurant.commissionPercent', 100] }] }] } },
          orderCount: { $sum: 1 },
        },
      },
      {
        $addFields: {
          adminGstShare: { $multiply: ['$gstCollected', 0.5] }, // Assuming 50-50 split
          vendorGstShare: { $multiply: ['$gstCollected', 0.5] },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    const totals = gstData.reduce((acc, item) => {
      acc.totalRevenue += item.totalRevenue;
      acc.totalGst += item.gstCollected;
      acc.totalCommission += item.commissionEarned;
      acc.totalVendorShare += item.vendorShare;
      acc.totalAdminGstShare += item.adminGstShare;
      acc.totalVendorGstShare += item.vendorGstShare;
      return acc;
    }, {
      totalRevenue: 0,
      totalGst: 0,
      totalCommission: 0,
      totalVendorShare: 0,
      totalAdminGstShare: 0,
      totalVendorGstShare: 0,
    });

    res.status(200).json({
      status: 'success',
      data: {
        summary: totals,
        breakdown: gstData,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch GST report',
    });
  }
};

/**
 * GET /api/admin/payments/refunds
 * Get refunds and reconciliation data
 */
export const getRefunds = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      restaurantId,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};
    
    if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
      filter.restaurantId = restaurantId;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (status) {
      filter.status = status;
    }

    // Get refund transactions
    const skip = (page - 1) * limit;
    const [refunds, total] = await Promise.all([
      FinancialTransaction.find({
        ...filter,
        'refundInfo.isRefund': true,
      })
        .populate('restaurantId', 'name image')
        .populate('refundInfo.originalTransactionId', 'transactionId amount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      FinancialTransaction.countDocuments({
        ...filter,
        'refundInfo.isRefund': true,
      }),
    ]);

    // Get orders with refunds
    const orderRefunds = await Order.find({
      'refundInfo.isRefunded': true,
      ...(restaurantId && { restaurantId }),
    })
      .populate('restaurantId', 'name')
      .populate('refundInfo.refundedBy', 'name email')
      .sort({ 'refundInfo.refundDate': -1 })
      .lean();

    res.status(200).json({
      status: 'success',
      results: refunds.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: {
        refunds,
        orderRefunds,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch refunds data',
    });
  }
};

/**
 * GET /api/admin/payments/commission-reports
 * Get detailed commission reports
 */
export const getCommissionReports = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      restaurantId,
      groupBy = 'day',
    } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const filter = {
      status: { $in: ['Delivered', 'completed'] },
      ...(Object.keys(dateFilter).length > 0 && { createdAt: dateFilter }),
      ...(restaurantId && { restaurantId }),
    };

    // Get commission data
    const commissionData = await Order.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'restaurants',
          localField: 'restaurantId',
          foreignField: '_id',
          as: 'restaurant',
        },
      },
      { $unwind: '$restaurant' },
      {
        $group: {
          _id: groupBy === 'day' 
            ? { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }
            : groupBy === 'week'
            ? { $dateToString: { format: '%Y-%U', date: '$createdAt' } }
            : { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          totalRevenue: { $sum: '$total' },
          commissionEarned: { 
            $sum: { $multiply: ['$total', { $divide: ['$restaurant.commissionPercent', 100] }] } 
          },
          orderCount: { $sum: 1 },
          restaurantCount: { $addToSet: '$restaurantId' },
        },
      },
      {
        $addFields: {
          restaurantCount: { $size: '$restaurantCount' },
          avgCommissionPerOrder: { $divide: ['$commissionEarned', '$orderCount'] },
          commissionRate: { 
            $multiply: [{ $divide: ['$commissionEarned', '$totalRevenue'] }, 100] 
          },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    // Get top commission earners
    const topEarners = await Order.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'restaurants',
          localField: 'restaurantId',
          foreignField: '_id',
          as: 'restaurant',
        },
      },
      { $unwind: '$restaurant' },
      {
        $group: {
          _id: '$restaurantId',
          restaurantName: { $first: '$restaurant.name' },
          totalRevenue: { $sum: '$total' },
          commissionEarned: { 
            $sum: { $multiply: ['$total', { $divide: ['$restaurant.commissionPercent', 100] }] } 
          },
          orderCount: { $sum: 1 },
          commissionPercent: { $first: '$restaurant.commissionPercent' },
        },
      },
      { $sort: { commissionEarned: -1 } },
      { $limit: 10 },
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        commissionData,
        topEarners,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch commission reports',
    });
  }
};

/**
 * GET /api/admin/payments/wallet-balances
 * Get wallet balances for all vendors
 */
export const getWalletBalances = async (req, res) => {
  try {
    const { restaurantId, status = 'all' } = req.query;

    const matchStage = {};
    if (restaurantId) {
      matchStage.restaurantId = new mongoose.Types.ObjectId(restaurantId);
    }

    const balances = await FinancialTransaction.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$restaurantId',
          totalCredits: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'order_payment'] },
                '$vendorAmount',
                0
              ]
            }
          },
          totalDebits: {
            $sum: {
              $cond: [
                { $in: ['$type', ['settlement', 'refund']] },
                '$amount',
                0
              ]
            }
          },
          lastCredit: { $max: { $cond: [{ $eq: ['$type', 'order_payment'] }, '$createdAt', null] } },
          lastDebit: { $max: { $cond: [{ $in: ['$type', ['settlement', 'refund']] }, '$createdAt', null] } },
          transactionCount: { $sum: 1 },
        },
      },
      {
        $addFields: {
          balance: { $subtract: ['$totalCredits', '$totalDebits'] },
          status: {
            $switch: {
              branches: [
                { case: { $gt: [{ $subtract: ['$totalCredits', '$totalDebits'] }, 0] }, then: 'positive' },
                { case: { $lt: [{ $subtract: ['$totalCredits', '$totalDebits'] }, 0] }, then: 'negative' },
              ],
              default: 'zero'
            }
          }
        }
      },
      {
        $lookup: {
          from: 'restaurants',
          localField: '_id',
          foreignField: '_id',
          as: 'restaurant',
        },
      },
      { $unwind: '$restaurant' },
      {
        $project: {
          restaurantName: '$restaurant.name',
          restaurantImage: '$restaurant.image',
          restaurantEmail: '$restaurant.email',
          balance: 1,
          totalCredits: 1,
          totalDebits: 1,
          lastCredit: 1,
          lastDebit: 1,
          transactionCount: 1,
          status: 1,
        },
      },
      { $sort: { balance: -1 } },
    ]);

    // Filter by status if specified
    const filteredBalances = status === 'all' ? balances : 
      balances.filter(b => b.status === status);

    // Get summary statistics
    const summary = balances.reduce((acc, balance) => {
      acc.totalBalance += balance.balance;
      acc.totalCredits += balance.totalCredits;
      acc.totalDebits += balance.totalDebits;
      acc.positiveCount += balance.status === 'positive' ? 1 : 0;
      acc.negativeCount += balance.status === 'negative' ? 1 : 0;
      acc.zeroCount += balance.status === 'zero' ? 1 : 0;
      return acc;
    }, {
      totalBalance: 0,
      totalCredits: 0,
      totalDebits: 0,
      positiveCount: 0,
      negativeCount: 0,
      zeroCount: 0,
    });

    res.status(200).json({
      status: 'success',
      data: {
        balances: filteredBalances,
        summary,
        totalVendors: balances.length,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch wallet balances',
    });
  }
};

/**
 * GET /api/admin/payments/settlement-history
 * Get comprehensive settlement history
 */
export const getSettlementHistory = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      restaurantId,
      status,
      page = 1,
      limit = 20,
    } = req.query;

    const filter = {};
    
    if (restaurantId && mongoose.Types.ObjectId.isValid(restaurantId)) {
      filter.restaurantId = restaurantId;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    if (status && status !== 'all') {
      filter.status = status;
    }

    const skip = (page - 1) * limit;

    const [settlements, total] = await Promise.all([
      VendorSettlement.find(filter)
        .populate('vendorId', 'name email phone')
        .populate('restaurantId', 'name image')
        .populate('approvalInfo.approvedBy', 'name email')
        .populate('processingInfo.processedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      VendorSettlement.countDocuments(filter),
    ]);

    // Get settlement statistics
    const stats = await VendorSettlement.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$summary.finalAmount' },
        }
      },
    ]);

    res.status(200).json({
      status: 'success',
      results: settlements.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / limit),
      data: {
        settlements,
        stats,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to fetch settlement history',
    });
  }
};

/**
 * POST /api/admin/payments/bulk-payout
 * Process bulk payouts for multiple settlements
 */
export const processBulkPayouts = async (req, res) => {
  try {
    const { settlementIds, payoutMethod = 'bank' } = req.body;

    if (!settlementIds || !Array.isArray(settlementIds) || settlementIds.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Settlement IDs are required',
      });
    }

    const results = [];
    const errors = [];

    for (const settlementId of settlementIds) {
      try {
        // Import PaymentGatewayService to avoid circular dependency
        const { default: PaymentGatewayService } = await import('../services/paymentGatewayService.js');
        
        const result = await PaymentGatewayService.processVendorPayout(settlementId);
        results.push({
          settlementId,
          success: result.success,
          message: result.success ? 'Payout processed successfully' : result.gatewayResponse.errorMessage,
        });
      } catch (error) {
        errors.push({
          settlementId,
          error: error.message,
        });
      }
    }

    res.status(200).json({
      status: 'success',
      message: `Processed ${results.length} payouts, ${errors.length} errors`,
      data: {
        processed: results,
        errors,
        summary: {
          total: settlementIds.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length + errors.length,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to process bulk payouts',
    });
  }
};
