/**
 * Advanced Reporting System Controller
 * Handles comprehensive business reporting with multiple data sources
 */
import Report from '../../models/Report.js';
import Order from '../../models/Order.js';
import User from '../../models/User.js';
import Restaurant from '../../models/Restaurant.js';
import Invoice from '../../models/Invoice.js';
import FinancialTransaction from '../../models/FinancialTransaction.js';
import { generateCSVReport } from '../../utils/csvGenerator.js';
import { generateExcelReport } from '../../utils/excelGenerator.js';
import { generatePDFReport } from '../../utils/pdfReportGenerator.js';
import fs from 'fs';

// Generate comprehensive report
export const generateReport = async (req, res) => {
  try {
    const {
      type,
      subType,
      dateFrom,
      dateTo,
      parameters = {},
      format = 'json',
      name,
      description,
      isScheduled = false,
      scheduleConfig
    } = req.body;

    // Validate required fields
    if (!type || !dateFrom || !dateTo) {
      return res.status(400).json({
        success: false,
        message: 'Type, dateFrom, and dateTo are required'
      });
    }

    // Create report record
    const report = new Report({
      name: name || `${type} Report`,
      type,
      subType,
      description,
      dateRange: {
        from: new Date(dateFrom),
        to: new Date(dateTo)
      },
      parameters: Object.entries(parameters).map(([key, value]) => ({
        name: key,
        value,
        type: typeof value
      })),
      file: {
        format
      },
      generatedBy: req.user._id,
      isScheduled,
      scheduleConfig: isScheduled ? scheduleConfig : undefined
    });

    await report.save();

    // Generate report data based on type
    let reportData;
    try {
      switch (type) {
        case 'revenue':
          reportData = await generateRevenueReport(dateFrom, dateTo, parameters);
          break;
        case 'orders':
          reportData = await generateOrdersReport(dateFrom, dateTo, parameters);
          break;
        case 'vendors':
          reportData = await generateVendorsReport(dateFrom, dateTo, parameters);
          break;
        case 'riders':
          reportData = await generateRidersReport(dateFrom, dateTo, parameters);
          break;
        case 'payments':
          reportData = await generatePaymentsReport(dateFrom, dateTo, parameters);
          break;
        case 'invoices':
          reportData = await generateInvoicesReport(dateFrom, dateTo, parameters);
          break;
        case 'customers':
          reportData = await generateCustomersReport(dateFrom, dateTo, parameters);
          break;
        case 'financial':
          reportData = await generateFinancialReport(dateFrom, dateTo, parameters);
          break;
        case 'tax':
          reportData = await generateTaxReport(dateFrom, dateTo, parameters);
          break;
        default:
          throw new Error(`Unsupported report type: ${type}`);
      }

      // Update report with data
      report.data = reportData;
      report.recordCount = reportData.details?.length || 0;
      report.totalAmount = reportData.summary?.totalRevenue || reportData.summary?.totalAmount || 0;

      // Generate file if format is not JSON
      let fileInfo = { format: 'json' };
      if (format !== 'json') {
        fileInfo = await generateReportFile(reportData, type, format, report.name);
      }

      // Mark report as completed
      await report.markAsCompleted(fileInfo);

      // Schedule next run if it's a scheduled report
      if (isScheduled) {
        await report.scheduleNextRun();
      }

      res.status(201).json({
        success: true,
        message: 'Report generated successfully',
        data: report
      });

    } catch (error) {
      await report.markAsFailed(error);
      throw error;
    }

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
      error: error.message
    });
  }
};

// Get all reports
export const getReports = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      generatedBy,
      dateFrom,
      dateTo,
      search
    } = req.query;

    // Build query
    const query = {};
    
    if (type) query.type = type;
    if (status) query.status = status;
    if (generatedBy) query.generatedBy = generatedBy;
    
    // Date range filter
    if (dateFrom || dateTo) {
      query.generatedAt = {};
      if (dateFrom) query.generatedAt.$gte = new Date(dateFrom);
      if (dateTo) query.generatedAt.$lte = new Date(dateTo);
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Organization filter for multi-tenant support
    if (req.user?.organizationId) {
      query.organizationId = req.user.organizationId;
    }

    // Execute query with pagination
    const reports = await Report.find(query)
      .populate('generatedBy', 'name email')
      .sort({ generatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Get total count for pagination
    const total = await Report.countDocuments(query);

    res.status(200).json({
      success: true,
      data: {
        reports,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      }
    });

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch reports',
      error: error.message
    });
  }
};

// Get single report by ID
export const getReportById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const report = await Report.findById(id)
      .populate('generatedBy', 'name email')
      .populate('sharedWith', 'name email');

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check access permissions
    const hasAccess = report.generatedBy._id.toString() === req.user._id.toString() ||
                     report.isPublic ||
                     report.sharedWith.some(user => user._id.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    res.status(200).json({
      success: true,
      data: report
    });

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch report',
      error: error.message
    });
  }
};

// Download report file
export const downloadReport = async (req, res) => {
  try {
    const { id } = req.params;
    
    const report = await Report.findById(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check access permissions
    const hasAccess = report.generatedBy.toString() === req.user._id.toString() ||
                     report.isPublic ||
                     report.sharedWith.some(userId => userId.toString() === req.user._id.toString());

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    if (report.status !== 'completed' || !report.file.path) {
      return res.status(400).json({
        success: false,
        message: 'Report file not available'
      });
    }

    // Set headers for file download
    res.setHeader('Content-Type', report.file.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${report.file.originalName}"`);
    res.setHeader('Content-Length', report.file.size);

    // Stream the file
    const fileStream = fs.createReadStream(report.file.path);
    fileStream.pipe(res);

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to download report',
      error: error.message
    });
  }
};

// Delete report
export const deleteReport = async (req, res) => {
  try {
    const { id } = req.params;
    
    const report = await Report.findById(id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found'
      });
    }

    // Check if user can delete this report
    if (report.generatedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Delete file if exists
    if (report.file.path) {
      if (fs.existsSync(report.file.path)) {
        fs.unlinkSync(report.file.path);
      }
    }

    await Report.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Report deleted successfully'
    });

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to delete report',
      error: error.message
    });
  }
};

// Get report templates/types
export const getReportTemplates = async (req, res) => {
  try {
    const templates = [
      {
        type: 'revenue',
        name: 'Revenue Report',
        description: 'Comprehensive revenue analysis with trends and breakdowns',
        parameters: ['groupBy', 'includeTrends', 'vendorFilter'],
        formats: ['json', 'csv', 'excel', 'pdf']
      },
      {
        type: 'orders',
        name: 'Orders Report',
        description: 'Detailed order analysis with status and performance metrics',
        parameters: ['statusFilter', 'groupBy', 'includeItems'],
        formats: ['json', 'csv', 'excel', 'pdf']
      },
      {
        type: 'vendors',
        name: 'Vendors Report',
        description: 'Vendor performance and earnings analysis',
        parameters: ['includeEarnings', 'performanceMetrics', 'topCount'],
        formats: ['json', 'csv', 'excel', 'pdf']
      },
      {
        type: 'riders',
        name: 'Riders Report',
        description: 'Rider performance and delivery analytics',
        parameters: ['includeEarnings', 'performanceMetrics', 'activityFilter'],
        formats: ['json', 'csv', 'excel', 'pdf']
      },
      {
        type: 'payments',
        name: 'Payments Report',
        description: 'Payment transactions and gateway analysis',
        parameters: ['paymentMethod', 'statusFilter', 'includeRefunds'],
        formats: ['json', 'csv', 'excel', 'pdf']
      },
      {
        type: 'invoices',
        name: 'Invoices Report',
        description: 'Invoice analysis with tax and payment details',
        parameters: ['statusFilter', 'taxBreakdown', 'vendorFilter'],
        formats: ['json', 'csv', 'excel', 'pdf']
      },
      {
        type: 'customers',
        name: 'Customers Report',
        description: 'Customer behavior and order patterns analysis',
        parameters: ['includeDemographics', 'orderPatterns', 'segmentation'],
        formats: ['json', 'csv', 'excel', 'pdf']
      },
      {
        type: 'financial',
        name: 'Financial Report',
        description: 'Comprehensive financial analysis and P&L',
        parameters: ['includePnL', 'cashFlow', 'balanceSheet'],
        formats: ['json', 'csv', 'excel', 'pdf']
      },
      {
        type: 'tax',
        name: 'Tax Report',
        description: 'GST and tax compliance reports',
        parameters: ['taxType', 'gstrType', 'complianceCheck'],
        formats: ['json', 'csv', 'excel', 'pdf']
      }
    ];

    res.status(200).json({
      success: true,
      data: templates
    });

  } catch (error) {    res.status(500).json({
      success: false,
      message: 'Failed to fetch report templates',
      error: error.message
    });
  }
};

// Helper functions for generating different report types

async function generateRevenueReport(dateFrom, dateTo, parameters) {
  const matchStage = {
    createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) },
    status: 'Delivered'
  };

  // Add organization filter if needed
  if (parameters.organizationId) {
    matchStage.organizationId = new mongoose.Types.ObjectId(parameters.organizationId);
  }

  const revenueData = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: parameters.groupBy === 'daily' ? {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' },
          day: { $dayOfMonth: '$createdAt' }
        } : parameters.groupBy === 'monthly' ? {
          year: { $year: '$createdAt' },
          month: { $month: '$createdAt' }
        } : {
          year: { $year: '$createdAt' }
        },
        totalRevenue: { $sum: '$total' },
        totalOrders: { $sum: 1 },
        averageOrderValue: { $avg: '$total' },
        totalTax: { $sum: '$tax' },
        totalDeliveryFee: { $sum: '$deliveryFee' },
        totalPlatformFee: { $sum: '$platformFee' }
      }
    },
    { $sort: { '_id.year': -1, '_id.month': -1, '_id.day': -1 } }
  ]);

  // Get payment method breakdown
  const paymentBreakdown = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        total: { $sum: '$total' }
      }
    }
  ]);

  return {
    summary: {
      totalRevenue: revenueData.reduce((sum, item) => sum + item.totalRevenue, 0),
      totalOrders: revenueData.reduce((sum, item) => sum + item.totalOrders, 0),
      averageOrderValue: revenueData.length > 0 ? 
        revenueData.reduce((sum, item) => sum + item.averageOrderValue, 0) / revenueData.length : 0,
      totalTax: revenueData.reduce((sum, item) => sum + item.totalTax, 0),
      totalDeliveryFee: revenueData.reduce((sum, item) => sum + item.totalDeliveryFee, 0),
      totalPlatformFee: revenueData.reduce((sum, item) => sum + item.totalPlatformFee, 0)
    },
    details: revenueData,
    charts: [
      {
        type: 'line',
        title: 'Revenue Trend',
        data: revenueData.map(item => ({
          date: item._id,
          revenue: item.totalRevenue,
          orders: item.totalOrders
        }))
      },
      {
        type: 'pie',
        title: 'Payment Methods',
        data: paymentBreakdown.map(item => ({
          method: item._id,
          count: item.count,
          total: item.total
        }))
      }
    ]
  };
}

async function generateOrdersReport(dateFrom, dateTo, parameters) {
  const matchStage = {
    createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
  };

  if (parameters.statusFilter) {
    matchStage.status = parameters.statusFilter;
  }

  const ordersData = await Order.find(matchStage)
    .populate('userId', 'name email phone')
    .populate('restaurantId', 'name phone')
    .sort({ createdAt: -1 });

  const statusBreakdown = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalValue: { $sum: '$total' }
      }
    }
  ]);

  return {
    summary: {
      totalOrders: ordersData.length,
      totalValue: ordersData.reduce((sum, order) => sum + order.total, 0),
      averageValue: ordersData.length > 0 ? 
        ordersData.reduce((sum, order) => sum + order.total, 0) / ordersData.length : 0
    },
    details: ordersData,
    charts: [
      {
        type: 'pie',
        title: 'Order Status Distribution',
        data: statusBreakdown.map(item => ({
          status: item._id,
          count: item.count,
          value: item.totalValue
        }))
      }
    ]
  };
}

async function generateVendorsReport(dateFrom, dateTo, parameters) {
  const matchStage = {
    createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
  };

  const vendorPerformance = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$restaurantId',
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$total' },
        averageOrderValue: { $avg: '$total' },
        totalTax: { $sum: '$tax' }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: parameters.topCount || 50 }
  ]);

  // Populate vendor details
  const vendorIds = vendorPerformance.map(item => item._id);
  const vendors = await Restaurant.find({ _id: { $in: vendorIds } })
    .select('name email phone address commissionPercent');

  const vendorDetails = vendorPerformance.map((perf, index) => {
    const vendor = vendors.find(v => v._id.toString() === perf._id.toString());
    return {
      ...perf,
      vendor: vendor
    };
  });

  return {
    summary: {
      totalVendors: vendorDetails.length,
      totalRevenue: vendorDetails.reduce((sum, item) => sum + item.totalRevenue, 0),
      totalOrders: vendorDetails.reduce((sum, item) => sum + item.totalOrders, 0)
    },
    details: vendorDetails,
    charts: [
      {
        type: 'bar',
        title: 'Top Performing Vendors',
        data: vendorDetails.slice(0, 10).map(item => ({
          name: item.vendor?.name || 'Unknown',
          revenue: item.totalRevenue,
          orders: item.totalOrders
        }))
      }
    ]
  };
}

async function generateRidersReport(dateFrom, dateTo, parameters) {
  const matchStage = {
    createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) },
    riderId: { $exists: true, $ne: null }
  };

  const riderPerformance = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$riderId',
        totalOrders: { $sum: 1 },
        completedOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] }
        },
        totalEarnings: { $sum: '$deliveryFee' },
        averageDeliveryTime: { $avg: '$deliveryTime' }
      }
    },
    { $sort: { completedOrders: -1 } }
  ]);

  // Populate rider details
  const riderIds = riderPerformance.map(item => item._id);
  const riders = await User.find({ _id: { $in: riderIds } })
    .select('name email phone vehicleName vehicleNumber currentRating');

  const riderDetails = riderPerformance.map((perf, index) => {
    const rider = riders.find(r => r._id.toString() === perf._id.toString());
    return {
      ...perf,
      rider: rider,
      successRate: perf.totalOrders > 0 ? (perf.completedOrders / perf.totalOrders) * 100 : 0
    };
  });

  return {
    summary: {
      totalRiders: riderDetails.length,
      totalOrders: riderDetails.reduce((sum, item) => sum + item.totalOrders, 0),
      completedOrders: riderDetails.reduce((sum, item) => sum + item.completedOrders, 0),
      totalEarnings: riderDetails.reduce((sum, item) => sum + item.totalEarnings, 0)
    },
    details: riderDetails,
    charts: [
      {
        type: 'bar',
        title: 'Top Performing Riders',
        data: riderDetails.slice(0, 10).map(item => ({
          name: item.rider?.name || 'Unknown',
          orders: item.completedOrders,
          earnings: item.totalEarnings,
          successRate: item.successRate
        }))
      }
    ]
  };
}

async function generatePaymentsReport(dateFrom, dateTo, parameters) {
  const matchStage = {
    createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
  };

  if (parameters.paymentMethod) {
    matchStage.paymentMethod = parameters.paymentMethod;
  }

  if (parameters.statusFilter) {
    matchStage.paymentStatus = parameters.statusFilter;
  }

  const paymentsData = await FinancialTransaction.find(matchStage)
    .populate('orderId', 'status total')
    .populate('restaurantId', 'name')
    .sort({ createdAt: -1 });

  const paymentBreakdown = await FinancialTransaction.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$paymentMethod',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        successRate: {
          $avg: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        }
      }
    }
  ]);

  return {
    summary: {
      totalTransactions: paymentsData.length,
      totalAmount: paymentsData.reduce((sum, payment) => sum + payment.amount, 0),
      averageAmount: paymentsData.length > 0 ? 
        paymentsData.reduce((sum, payment) => sum + payment.amount, 0) / paymentsData.length : 0
    },
    details: paymentsData,
    charts: [
      {
        type: 'pie',
        title: 'Payment Methods Distribution',
        data: paymentBreakdown.map(item => ({
          method: item._id,
          count: item.count,
          amount: item.totalAmount,
          successRate: item.successRate * 100
        }))
      }
    ]
  };
}

async function generateInvoicesReport(dateFrom, dateTo, parameters) {
  const matchStage = {
    issueDate: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
  };

  if (parameters.statusFilter) {
    matchStage.status = parameters.statusFilter;
  }

  const invoicesData = await Invoice.find(matchStage)
    .populate('customerId', 'name email')
    .populate('vendorId', 'name')
    .sort({ issueDate: -1 });

  const statusBreakdown = await Invoice.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalAmount: { $sum: '$grandTotal' },
        totalTax: { $sum: '$taxAmount' }
      }
    }
  ]);

  return {
    summary: {
      totalInvoices: invoicesData.length,
      totalAmount: invoicesData.reduce((sum, invoice) => sum + invoice.grandTotal, 0),
      totalTax: invoicesData.reduce((sum, invoice) => sum + invoice.taxAmount, 0)
    },
    details: invoicesData,
    charts: [
      {
        type: 'pie',
        title: 'Invoice Status Distribution',
        data: statusBreakdown.map(item => ({
          status: item._id,
          count: item.count,
          amount: item.totalAmount,
          tax: item.totalTax
        }))
      }
    ]
  };
}

async function generateCustomersReport(dateFrom, dateTo, parameters) {
  const matchStage = {
    createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
  };

  const customerOrders = await Order.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$userId',
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$total' },
        averageOrderValue: { $avg: '$total' },
        firstOrder: { $min: '$createdAt' },
        lastOrder: { $max: '$createdAt' }
      }
    },
    { $sort: { totalSpent: -1 } }
  ]);

  // Populate customer details
  const customerIds = customerOrders.map(item => item._id);
  const customers = await User.find({ _id: { $in: customerIds } })
    .select('name email phone location createdAt');

  const customerDetails = customerOrders.map((orders, index) => {
    const customer = customers.find(c => c._id.toString() === orders._id.toString());
    return {
      ...orders,
      customer: customer,
      customerSince: customer?.createdAt
    };
  });

  return {
    summary: {
      totalCustomers: customerDetails.length,
      totalOrders: customerDetails.reduce((sum, item) => sum + item.totalOrders, 0),
      totalSpent: customerDetails.reduce((sum, item) => sum + item.totalSpent, 0)
    },
    details: customerDetails,
    charts: [
      {
        type: 'bar',
        title: 'Top Customers by Spending',
        data: customerDetails.slice(0, 10).map(item => ({
          name: item.customer?.name || 'Unknown',
          orders: item.totalOrders,
          spent: item.totalSpent,
          avgOrder: item.averageOrderValue
        }))
      }
    ]
  };
}

async function generateFinancialReport(dateFrom, dateTo, parameters) {
  const matchStage = {
    createdAt: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
  };

  const transactions = await FinancialTransaction.find(matchStage)
    .sort({ createdAt: -1 });

  const revenueBreakdown = await FinancialTransaction.aggregate([
    { $match: { ...matchStage, type: 'order_payment', status: 'completed' } },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        commissionAmount: { $sum: '$commissionAmount' },
        vendorAmount: { $sum: '$vendorAmount' },
        gstAmount: { $sum: '$gstAmount' },
        platformFee: { $sum: '$platformFee' }
      }
    }
  ]);

  return {
    summary: {
      totalRevenue: transactions.reduce((sum, t) => sum + (t.amount > 0 ? t.amount : 0), 0),
      totalCommission: revenueBreakdown.reduce((sum, item) => sum + item.commissionAmount, 0),
      totalVendorPayouts: revenueBreakdown.reduce((sum, item) => sum + item.vendorAmount, 0),
      totalGST: revenueBreakdown.reduce((sum, item) => sum + item.gstAmount, 0),
      totalPlatformFees: revenueBreakdown.reduce((sum, item) => sum + item.platformFee, 0)
    },
    details: transactions,
    charts: [
      {
        type: 'pie',
        title: 'Revenue Breakdown',
        data: revenueBreakdown.map(item => ({
          type: item._id,
          amount: item.totalAmount,
          commission: item.commissionAmount,
          vendor: item.vendorAmount
        }))
      }
    ]
  };
}

async function generateTaxReport(dateFrom, dateTo, parameters) {
  const matchStage = {
    issueDate: { $gte: new Date(dateFrom), $lte: new Date(dateTo) }
  };

  const taxData = await Invoice.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $year: '$issueDate' },
          month: { $month: '$issueDate' }
        },
        totalRevenue: { $sum: '$grandTotal' },
        totalCGST: { $sum: '$taxDetails.cgstAmount' },
        totalSGST: { $sum: '$taxDetails.sgstAmount' },
        totalIGST: { $sum: '$taxDetails.igstAmount' },
        totalTax: { $sum: '$taxAmount' }
      }
    },
    { $sort: { '_id.year': -1, '_id.month': -1 } }
  ]);

  return {
    summary: {
      totalRevenue: taxData.reduce((sum, item) => sum + item.totalRevenue, 0),
      totalCGST: taxData.reduce((sum, item) => sum + item.totalCGST, 0),
      totalSGST: taxData.reduce((sum, item) => sum + item.totalSGST, 0),
      totalIGST: taxData.reduce((sum, item) => sum + item.totalIGST, 0),
      totalTax: taxData.reduce((sum, item) => sum + item.totalTax, 0)
    },
    details: taxData,
    charts: [
      {
        type: 'line',
        title: 'Tax Trends',
        data: taxData.map(item => ({
          period: item._id,
          cgst: item.totalCGST,
          sgst: item.totalSGST,
          igst: item.totalIGST,
          total: item.totalTax
        }))
      }
    ]
  };
}

// Helper function to generate report file
async function generateReportFile(data, type, format, filename) {
  switch (format) {
    case 'csv':
      return await generateCSVReport(data, type, filename);
    case 'excel':
      return await generateExcelReport(data, type, filename);
    case 'pdf':
      return await generatePDFReport(data, type, filename);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
