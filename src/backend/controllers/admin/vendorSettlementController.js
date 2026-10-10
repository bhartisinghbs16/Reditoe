/**
 * Admin Vendor Settlement Controller
 */
import VendorSettlement from '../../models/VendorSettlement.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import Order from '../../models/Order.js';
import { deriveOrderNumberFromId } from '../../models/Order.js';

// GET /api/admin/vendor-settlements - Get all settlements
export const getSettlements = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      vendorId,
      restaurantId,
      startDate,
      endDate,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    
    if (status && status !== 'all') filter.status = status;
    if (vendorId) filter.vendorId = vendorId;
    if (restaurantId) filter.restaurantId = restaurantId;

    // Date range filter
    if (startDate || endDate) {
      filter['settlementPeriod.startDate'] = {};
      if (startDate) filter['settlementPeriod.startDate'].$gte = new Date(startDate);
      if (endDate) filter['settlementPeriod.endDate'].$lte = new Date(endDate);
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const settlements = await VendorSettlement.find(filter)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('approvalInfo.approvedBy', 'name email')
      .populate('processingInfo.processedBy', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await VendorSettlement.countDocuments(filter);

    res.json({
      success: true,
      data: {
        settlements,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total,
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlements',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-settlements/summary - Get settlements summary
export const getSettlementSummary = async (req, res) => {
  try {
    const summary = await VendorSettlement.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$summary.finalAmount' }
        }
      }
    ]);

    const totalSettlements = await VendorSettlement.countDocuments();
    const totalAmount = await VendorSettlement.aggregate([
      { $group: { _id: null, total: { $sum: '$summary.finalAmount' } } }
    ]);

    res.json({
      success: true,
      data: {
        summary,
        totals: {
          count: totalSettlements,
          amount: totalAmount[0]?.total || 0
        }
      }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlement summary',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-settlements/:id - Get single settlement
export const getSettlementById = async (req, res) => {
  try {
    const { id } = req.params;

    const settlement = await VendorSettlement.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('approvalInfo.approvedBy', 'name email')
      .populate('processingInfo.processedBy', 'name email');

    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    res.json({
      success: true,
      data: { settlement }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch settlement',
      error: error.message
    });
  }
};

// POST /api/admin/vendor-settlements/generate - Generate new settlement
export const generateSettlement = async (req, res) => {
  try {
    const { vendorId, restaurantId, startDate, endDate } = req.body;

    if (!vendorId || !restaurantId || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Vendor ID, restaurant ID, start date, and end date are required'
      });
    }

    // Validate vendor and restaurant
    const vendor = await User.findById(vendorId);
    const restaurant = await Restaurant.findById(restaurantId);

    if (!vendor || vendor.role !== 'vendor') {
      return res.status(400).json({
        success: false,
        message: 'Invalid vendor'
      });
    }

    if (!restaurant) {
      return res.status(400).json({
        success: false,
        message: 'Invalid restaurant'
      });
    }

    // Get orders within the period
    const orders = await Order.find({
      restaurantId,
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      status: { $in: ['Delivered', 'Cancelled'] }
    });

    if (orders.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No orders found in the specified period'
      });
    }

    // Calculate settlement items
    const commissionPercent = restaurant.commissionPercent || 10;
    const gstPercent = restaurant.gstInfo?.gstPercentage || 5;
    // NOTE: platformFeePercent removed — platform fee is not deducted from vendor earning

    const settlementItems = orders.map(order => {
      // grossAmount = vendor's food revenue only (subtotal), NOT order.total
      // order.total includes delivery fee, tip, platform fee — money that never belonged to vendor
      const grossAmount = order.subtotal || 0;
      const commissionAmount = Math.round(grossAmount * (commissionPercent / 100));
      const gstAmount = Math.round(grossAmount * (gstPercent / 100));
      // platformFee stays with the platform — not deducted from vendor earning
      const netAmount = grossAmount - commissionAmount - gstAmount;
      
      const cancellationPenalty = order.status === 'Cancelled' ? 
        Math.round(grossAmount * 0.1) : 0;

      return {
        orderId: order._id,
        orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),
        orderDate: order.createdAt,
        grossAmount,
        commissionAmount,
        gstAmount,
        platformFee: 0, // platform fee stays with platform
        netAmount: netAmount - cancellationPenalty,
        cancellationPenalty,
        adjustmentAmount: 0,
        adjustmentReason: cancellationPenalty > 0 ? 'Order cancellation penalty' : undefined,
      };
    });

    // Calculate summary
    const summary = {
      totalOrders: settlementItems.length,
      grossRevenue: settlementItems.reduce((sum, item) => sum + item.grossAmount, 0),
      totalCommission: settlementItems.reduce((sum, item) => sum + item.commissionAmount, 0),
      totalGST: settlementItems.reduce((sum, item) => sum + item.gstAmount, 0),
      totalPlatformFee: settlementItems.reduce((sum, item) => sum + item.platformFee, 0),
      totalPenalties: settlementItems.reduce((sum, item) => sum + item.cancellationPenalty, 0),
      totalAdjustments: 0,
      netPayable: 0,
      tdsDeducted: 0,
      finalAmount: 0,
    };

    summary.netPayable = summary.grossRevenue - summary.totalCommission - summary.totalGST - 
      summary.totalPlatformFee - summary.totalPenalties;
    summary.tdsDeducted = Math.round((summary.totalCommission + summary.totalPlatformFee) * 0.02);
    summary.finalAmount = Math.max(0, summary.netPayable - summary.tdsDeducted);

    const count = await VendorSettlement.countDocuments();
    const settlementNumber = `SET-${Date.now()}-${count + 1}`;

    const settlement = new VendorSettlement({
      settlementNumber,
      vendorId,
      restaurantId,
      settlementPeriod: {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      status: 'pending',
      items: settlementItems,
      summary,
      bankDetails: {
        accountHolderName: vendor.bankDetails?.accountHolderName ||
          vendor.name || 'Vendor',
        accountNumber: vendor.bankDetails?.accountNumber ||
          'Not provided',
        bankName: vendor.bankDetails?.bankName ||
          'Not provided',
        ifsc: vendor.bankDetails?.ifsc ||
          'XXXX0000000',
        branch: vendor.bankDetails?.branch || '',
      },
      autoGenerated: true,
      dueDate: new Date(new Date(endDate).getTime() + 3 * 24 * 60 * 60 * 1000),
    });

    await settlement.save();

    const populatedSettlement = await VendorSettlement.findById(settlement._id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name');

    res.status(201).json({
      success: true,
      message: 'Settlement generated successfully',
      data: { settlement: populatedSettlement }
    });
  } catch (error) {    console.error('Settlement generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate settlement',
      error: error.message
    });
  }
};

// PATCH /api/admin/vendor-settlements/:id/approve - Approve settlement
export const approveSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { approvalNotes } = req.body;

    const settlement = await VendorSettlement.findById(id);
    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    if (settlement.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Only pending settlements can be approved'
      });
    }

    await settlement.approve(req.user.id, approvalNotes);

    const updatedSettlement = await VendorSettlement.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('approvalInfo.approvedBy', 'name email');

    res.json({
      success: true,
      message: 'Settlement approved successfully',
      data: { settlement: updatedSettlement }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to approve settlement',
      error: error.message
    });
  }
};

// PATCH /api/admin/vendor-settlements/:id/process - Process/settle payment
export const processSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      transactionId, 
      paymentMethod, 
      utrNumber, 
      referenceNumber, 
      processingNotes 
    } = req.body;

    const settlement = await VendorSettlement.findById(id);
    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    if (settlement.status !== 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Only approved settlements can be processed'
      });
    }

    const paymentInfo = {
      transactionId,
      paymentMethod,
      utrNumber,
      referenceNumber,
    };

    await settlement.process(req.user.id, paymentInfo, processingNotes);

    const updatedSettlement = await VendorSettlement.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name')
      .populate('processingInfo.processedBy', 'name email');

    res.json({
      success: true,
      message: 'Settlement processed successfully',
      data: { settlement: updatedSettlement }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to process settlement',
      error: error.message
    });
  }
};

// PATCH /api/admin/vendor-settlements/:id/reject - Reject settlement
export const rejectSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const { failureReason } = req.body;

    if (!failureReason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const settlement = await VendorSettlement.findById(id);
    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    settlement.status = 'failed';
    settlement.failureReason = failureReason;
    await settlement.save();

    const updatedSettlement = await VendorSettlement.findById(id)
      .populate('vendorId', 'name email phone')
      .populate('restaurantId', 'name');

    res.json({
      success: true,
      message: 'Settlement rejected successfully',
      data: { settlement: updatedSettlement }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to reject settlement',
      error: error.message
    });
  }
};

// GET /api/admin/vendor-settlements/:id/documents/:type - Download settlement document
export const downloadSettlementDocument = async (req, res) => {
  try {
    const { id, type } = req.params;

    const settlement = await VendorSettlement.findById(id);
    if (!settlement) {
      return res.status(404).json({
        success: false,
        message: 'Settlement not found'
      });
    }

    const document = settlement.documents.find(doc => doc.type === type);
    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // In a real implementation, you would serve the actual file
    // For now, return the document info
    res.json({
      success: true,
      data: { document }
    });
  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to download document',
      error: error.message
    });
  }
};
