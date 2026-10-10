/**
 * Invoice Controller - Complete Invoice Management System
 */
import Invoice from '../../models/Invoice.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import FinancialTransaction from '../../models/FinancialTransaction.js';
import { generateInvoicePDF } from '../../utils/pdfGenerator.js';
import { calculateTax } from '../../utils/taxCalculator.js';

// Generate invoice from completed order
export const generateInvoiceFromOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    
    // Validate order exists and is completed
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }
    
    // Check if invoice already exists for this order
    const existingInvoice = await Invoice.findOne({ orderId });
    if (existingInvoice) {
      return res.status(400).json({
        success: false,
        message: 'Invoice already generated for this order',
        invoice: existingInvoice
      });
    }
    
    // Only generate invoice for completed/delivered orders
    if (order.status !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Invoice can only be generated for delivered orders'
      });
    }
    
    // Find payment transaction for this order
    const paymentTransaction = await FinancialTransaction.findOne({
      orderId,
      type: 'order_payment',
      status: 'completed'
    });
    
    // Calculate tax details
    const taxDetails = calculateTax(order.subtotal, order.restaurantId.address);
    
    // Prepare line items
    const lineItems = order.items.map(item => ({
      name: item.name,
      description: `Food item - ${item.selectedAddons.map(addon => addon.name).join(', ') || 'No addons'}`,
      quantity: item.quantity,
      unitPrice: item.price,
      totalPrice: item.price * item.quantity,
      taxAmount: (item.price * item.quantity) * (taxDetails.cgstRate + taxDetails.sgstRate) / 100,
      discountAmount: 0
    }));
    
    // Create invoice
    const invoice = new Invoice({
      invoiceNumber: `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`, // Generate invoice number
      orderId: order._id,
      customerId: order.userId || new mongoose.Types.ObjectId(), // Use fallback if null
      vendorId: order.restaurantId?._id || order.restaurantId || new mongoose.Types.ObjectId(), // Handle both cases
      paymentTransactionId: paymentTransaction?._id,
      
      // Addresses
      billingAddress: order.deliveryAddress,
      shippingAddress: order.deliveryAddress,
      
      // Line items
      lineItems,
      
      // Financial breakdown
      subtotal: order.subtotal,
      taxAmount: order.tax,
      deliveryFee: order.deliveryFee,
      discountAmount: 0, // Can be calculated from coupons if needed
      platformFee: order.platformFee,
      grandTotal: order.total,
      
      // Tax details
      taxDetails,
      
      // Payment information
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      
      // Dates
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
      
      // GST information
      gstInfo: {
        customerGstNumber: '', // Can be fetched from user profile if available
        vendorGstNumber: order.restaurantId?.gstInfo?.gstNumber || '', // Handle nested object
        isReverseCharge: false,
        placeOfSupply: order.restaurantId?.address?.state || order.deliveryAddress?.state || '',
        taxType: taxDetails.igstRate > 0 ? 'IGST' : 'GST'
      },
      
      // Organization support
      organizationId: order.organizationId
    });
    
    await invoice.save();
    
    // Populate related data for response
    await invoice.populate([
      { path: 'customerId', select: 'name email phone' },
      { path: 'vendorId', select: 'name phone email address' },
      { path: 'orderId', select: 'status timeline' }
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Invoice generated successfully',
      data: invoice
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate invoice',
      error: error.message
    });
  }
};

// Get all invoices with filtering
export const getInvoices = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      customerId,
      vendorId,
      dateFrom,
      dateTo,
      search,
      sortBy = 'issueDate',
      sortOrder = 'desc'
    } = req.query;
    
    // Build query
    const query = {};
    
    if (status) query.status = status;
    if (customerId) query.customerId = customerId;
    if (vendorId) query.vendorId = vendorId;
    
    // Date range filter
    if (dateFrom || dateTo) {
      query.issueDate = {};
      if (dateFrom) query.issueDate.$gte = new Date(dateFrom);
      if (dateTo) query.issueDate.$lte = new Date(dateTo);
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { 'billingAddress.street': { $regex: search, $options: 'i' } },
        { 'billingAddress.city': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Organization filter for multi-tenant support
    if (req.user?.organizationId) {
      query.organizationId = req.user.organizationId;
    }
    
    // Sort options
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute query with pagination
    const invoices = await Invoice.find(query)
      .populate('customerId', 'name email phone')
      .populate('vendorId', 'name phone email')
      .populate('orderId', 'status paymentMethod orderNumber')
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    // Get total count for pagination
    const total = await Invoice.countDocuments(query);
    
    // Calculate summary statistics
    const summary = await Invoice.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalRevenue: { $sum: '$grandTotal' },
          paidInvoices: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
          },
          pendingInvoices: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          refundedInvoices: {
            $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] }
          }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        invoices,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        },
        summary: summary[0] || {
          totalInvoices: 0,
          totalRevenue: 0,
          paidInvoices: 0,
          pendingInvoices: 0,
          refundedInvoices: 0
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoices',
      error: error.message
    });
  }
};

// Get single invoice by ID
export const getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const invoice = await Invoice.findById(id)
      .populate('customerId', 'name email phone savedAddresses')
      .populate('vendorId', 'name phone email address gstInfo')
      .populate('paymentTransactionId', 'transactionId status paymentMethod')
      .populate('orderId', 'items timeline status paymentMethod');
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: invoice
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice',
      error: error.message
    });
  }
};

// Update invoice status
export const updateInvoiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, paymentDate } = req.body;
    
    if (!['generated', 'paid', 'pending', 'refunded', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status'
      });
    }
    
    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    // Update status
    invoice.status = status;
    
    // Update payment status based on invoice status
    if (status === 'paid') {
      invoice.paymentStatus = 'paid';
      invoice.paidDate = paymentDate ? new Date(paymentDate) : new Date();
    } else if (status === 'refunded') {
      invoice.paymentStatus = 'refunded';
    } else if (status === 'cancelled') {
      invoice.paymentStatus = 'failed';
    }
    
    // Add notes if provided
    if (notes) {
      invoice.notes = notes;
    }
    
    await invoice.save();
    
    // Populate for response
    await invoice.populate('customerId vendorId orderId');
    
    res.status(200).json({
      success: true,
      message: 'Invoice status updated successfully',
      data: invoice
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to update invoice status',
      error: error.message
    });
  }
};

// Process refund for invoice
export const processInvoiceRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const { refundAmount, refundReason, refundNotes } = req.body;
    
    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    if (invoice.status !== 'paid') {
      return res.status(400).json({
        success: false,
        message: 'Only paid invoices can be refunded'
      });
    }
    
    if (refundAmount > invoice.grandTotal) {
      return res.status(400).json({
        success: false,
        message: 'Refund amount cannot exceed invoice total'
      });
    }
    
    // Process refund
    await invoice.processRefund(refundAmount, refundReason);
    
    if (refundNotes) {
      invoice.notes = refundNotes;
      await invoice.save();
    }
    
    // Create refund transaction record
    const refundTransaction = new FinancialTransaction({
      type: 'refund',
      orderId: invoice.orderId,
      restaurantId: invoice.vendorId,
      amount: -refundAmount,
      status: 'completed',
      paymentMethod: invoice.paymentMethod,
      refundInfo: {
        isRefund: true,
        originalTransactionId: invoice.paymentTransactionId,
        refundReason,
        refundNotes
      },
      processedAt: new Date(),
      organizationId: invoice.organizationId
    });
    
    await refundTransaction.save();
    
    // Update invoice with refund transaction reference
    invoice.refundInfo.refundTransactionId = refundTransaction._id;
    await invoice.save();
    
    res.status(200).json({
      success: true,
      message: 'Refund processed successfully',
      data: {
        invoice,
        refundTransaction
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to process refund',
      error: error.message
    });
  }
};

// Download invoice PDF
export const downloadInvoicePDF = async (req, res) => {
  try {
    const { id } = req.params;
    
    const invoice = await Invoice.findById(id)
      .populate('customerId', 'name email phone')
      .populate('vendorId', 'name phone email address')
      .populate('orderId', 'items');
    
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: 'Invoice not found'
      });
    }
    
    // Generate PDF
    const pdfBuffer = await generateInvoicePDF(invoice);
    
    // Set headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    
    res.send(pdfBuffer);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate PDF',
      error: error.message
    });
  }
};

// Get invoice statistics
export const getInvoiceStatistics = async (req, res) => {
  try {
    const { dateFrom, dateTo, vendorId } = req.query;
    
    // Build match stage for aggregation
    const matchStage = {};
    
    if (dateFrom || dateTo) {
      matchStage.issueDate = {};
      if (dateFrom) matchStage.issueDate.$gte = new Date(dateFrom);
      if (dateTo) matchStage.issueDate.$lte = new Date(dateTo);
    }
    
    if (vendorId) matchStage.vendorId = new mongoose.Types.ObjectId(vendorId);
    
    // Organization filter for multi-tenant support
    if (req.user?.organizationId) {
      matchStage.organizationId = new mongoose.Types.ObjectId(req.user.organizationId);
    }
    
    // Get comprehensive statistics
    const statistics = await Invoice.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalInvoices: { $sum: 1 },
          totalRevenue: { $sum: '$grandTotal' },
          totalTax: { $sum: '$taxAmount' },
          totalDiscount: { $sum: '$discountAmount' },
          totalDeliveryFees: { $sum: '$deliveryFee' },
          totalPlatformFees: { $sum: '$platformFee' },
          paidInvoices: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] }
          },
          pendingInvoices: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          refundedInvoices: {
            $sum: { $cond: [{ $eq: ['$status', 'refunded'] }, 1, 0] }
          },
          cancelledInvoices: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          averageOrderValue: { $avg: '$grandTotal' },
          totalRefunds: { $sum: '$refundInfo.refundAmount' }
        }
      }
    ]);
    
    // Get monthly trends
    const monthlyTrends = await Invoice.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            year: { $year: '$issueDate' },
            month: { $month: '$issueDate' }
          },
          invoices: { $sum: 1 },
          revenue: { $sum: '$grandTotal' },
          averageValue: { $avg: '$grandTotal' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);
    
    // Get payment method breakdown
    const paymentBreakdown = await Invoice.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          total: { $sum: '$grandTotal' }
        }
      }
    ]);
    
    res.status(200).json({
      success: true,
      data: {
        summary: statistics[0] || {
          totalInvoices: 0,
          totalRevenue: 0,
          totalTax: 0,
          totalDiscount: 0,
          totalDeliveryFees: 0,
          totalPlatformFees: 0,
          paidInvoices: 0,
          pendingInvoices: 0,
          refundedInvoices: 0,
          cancelledInvoices: 0,
          averageOrderValue: 0,
          totalRefunds: 0
        },
        monthlyTrends,
        paymentBreakdown
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch invoice statistics',
      error: error.message
    });
  }
};
