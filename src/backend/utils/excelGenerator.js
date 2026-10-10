/**
 * Excel Report Generator Utility
 * Converts report data to Excel format using xlsx library
 */

import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

export const generateExcelReport = async (data, type, filename) => {
  try {
    const workbook = XLSX.utils.book_new();
    
    // Create summary sheet
    if (data.summary) {
      const summaryData = Object.entries(data.summary).map(([key, value]) => ({
        Metric: formatMetricName(key),
        Value: formatValue(value)
      }));
      
      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
    }

    // Create main data sheet
    const mainSheetData = convertToExcelData(data, type);
    const mainSheet = XLSX.utils.json_to_sheet(mainSheetData);
    XLSX.utils.book_append_sheet(workbook, mainSheet, 'Data');

    // Create chart sheets if available
    if (data.charts && data.charts.length > 0) {
      data.charts.forEach((chart, index) => {
        const chartData = chart.data.map(item => {
          const chartItem = {};
          Object.keys(item).forEach(key => {
            chartItem[formatColumnName(key)] = item[key];
          });
          return chartItem;
        });
        
        const chartSheet = XLSX.utils.json_to_sheet(chartData);
        XLSX.utils.book_append_sheet(workbook, chartSheet, `Chart ${index + 1} - ${chart.title}`);
      });
    }

    // Generate file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const excelFilename = `${filename}_${timestamp}.xlsx`;
    const filePath = path.join(process.cwd(), 'temp', 'reports', excelFilename);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write Excel file
    XLSX.writeFile(workbook, filePath);

    const stats = fs.statSync(filePath);

    return {
      filename: excelFilename,
      originalName: excelFilename,
      path: filePath,
      size: stats.size,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      format: 'excel'
    };

  } catch (error) {
    console.error('Error generating Excel report:', error);
    throw new Error('Failed to generate Excel report');
  }
};

function convertToExcelData(data, type) {
  switch (type) {
    case 'revenue':
      return data.details.map(item => ({
        'Date': formatDate(item._id),
        'Total Revenue': item.totalRevenue,
        'Total Orders': item.totalOrders,
        'Average Order Value': item.averageOrderValue,
        'Total Tax': item.totalTax,
        'Delivery Fee': item.totalDeliveryFee,
        'Platform Fee': item.totalPlatformFee
      }));

    case 'orders':
      return data.details.map(order => ({
        'Order ID': order._id,
        'Customer': order.userId?.name || 'N/A',
        'Restaurant': order.restaurantId?.name || 'N/A',
        'Status': order.status,
        'Payment Method': order.paymentMethod,
        'Total': order.total,
        'Created Date': order.createdAt,
        'Delivery Address': `${order.deliveryAddress?.street || ''}, ${order.deliveryAddress?.city || ''}`,
        'Items Count': order.items?.length || 0
      }));

    case 'vendors':
      return data.details.map(item => ({
        'Vendor Name': item.vendor?.name || 'N/A',
        'Vendor Email': item.vendor?.email || 'N/A',
        'Vendor Phone': item.vendor?.phone || 'N/A',
        'Total Orders': item.totalOrders,
        'Total Revenue': item.totalRevenue,
        'Average Order Value': item.averageOrderValue,
        'Commission %': item.vendor?.commissionPercent || 0,
        'Commission Earned': item.totalRevenue * (item.vendor?.commissionPercent || 0) / 100
      }));

    case 'riders':
      return data.details.map(item => ({
        'Rider Name': item.rider?.name || 'N/A',
        'Rider Email': item.rider?.email || 'N/A',
        'Rider Phone': item.rider?.phone || 'N/A',
        'Vehicle Name': item.rider?.vehicleName || 'N/A',
        'Vehicle Number': item.rider?.vehicleNumber || 'N/A',
        'Total Orders': item.totalOrders,
        'Completed Orders': item.completedOrders,
        'Cancelled Orders': item.totalOrders - item.completedOrders,
        'Success Rate %': item.successRate.toFixed(2),
        'Total Earnings': item.totalEarnings,
        'Average Earnings per Order': item.totalOrders > 0 ? item.totalEarnings / item.totalOrders : 0,
        'Current Rating': item.rider?.currentRating || 0
      }));

    case 'payments':
      return data.details.map(payment => ({
        'Transaction ID': payment.transactionId || 'N/A',
        'Type': payment.type,
        'Amount': payment.amount,
        'Commission Amount': payment.commissionAmount,
        'Vendor Amount': payment.vendorAmount,
        'GST Amount': payment.gstAmount,
        'Platform Fee': payment.platformFee,
        'Status': payment.status,
        'Payment Method': payment.paymentMethod || 'N/A',
        'Gateway Transaction ID': payment.gatewayTransactionId || 'N/A',
        'Created Date': payment.createdAt,
        'Processed Date': payment.processedAt,
        'Order ID': payment.orderId || 'N/A',
        'Restaurant': payment.restaurantId || 'N/A'
      }));

    case 'invoices':
      return data.details.map(invoice => ({
        'Invoice Number': invoice.invoiceNumber,
        'Customer Name': invoice.customerId?.name || 'N/A',
        'Customer Email': invoice.customerId?.email || 'N/A',
        'Vendor Name': invoice.vendorId?.name || 'N/A',
        'Status': invoice.status,
        'Payment Status': invoice.paymentStatus,
        'Payment Method': invoice.paymentMethod,
        'Subtotal': invoice.subtotal,
        'Tax Amount': invoice.taxAmount,
        'Delivery Fee': invoice.deliveryFee,
        'Platform Fee': invoice.platformFee,
        'Discount Amount': invoice.discountAmount,
        'Grand Total': invoice.grandTotal,
        'Issue Date': invoice.issueDate,
        'Due Date': invoice.dueDate,
        'Paid Date': invoice.paidDate,
        'Billing Address': `${invoice.billingAddress?.street || ''}, ${invoice.billingAddress?.city || ''}`,
        'GST Type': invoice.gstInfo?.taxType || 'N/A',
        'Place of Supply': invoice.gstInfo?.placeOfSupply || 'N/A'
      }));

    case 'customers':
      return data.details.map(item => ({
        'Customer Name': item.customer?.name || 'N/A',
        'Customer Email': item.customer?.email || 'N/A',
        'Customer Phone': item.customer?.phone || 'N/A',
        'Location': item.customer?.location || 'N/A',
        'Total Orders': item.totalOrders,
        'Total Spent': item.totalSpent,
        'Average Order Value': item.averageOrderValue,
        'Customer Since': item.customerSince,
        'First Order': item.firstOrder,
        'Last Order': item.lastOrder,
        'Days Since Last Order': item.lastOrder ? Math.floor((new Date() - new Date(item.lastOrder)) / (1000 * 60 * 60 * 24)) : 'N/A'
      }));

    case 'financial':
      return data.details.map(transaction => ({
        'Transaction ID': transaction.transactionId || 'N/A',
        'Type': transaction.type,
        'Amount': transaction.amount,
        'Commission Amount': transaction.commissionAmount,
        'Vendor Amount': transaction.vendorAmount,
        'GST Amount': transaction.gstAmount,
        'Platform Fee': transaction.platformFee,
        'Status': transaction.status,
        'Payment Method': transaction.paymentMethod || 'N/A',
        'Gateway Transaction ID': transaction.gatewayTransactionId || 'N/A',
        'Created Date': transaction.createdAt,
        'Processed Date': transaction.processedAt,
        'Order ID': transaction.orderId || 'N/A',
        'Restaurant ID': transaction.restaurantId || 'N/A',
        'Is Refund': transaction.refundInfo?.isRefund || false,
        'Refund Reason': transaction.refundInfo?.refundReason || '',
        'Notes': transaction.notes || ''
      }));

    case 'tax':
      return data.details.map(item => ({
        'Period': `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
        'Total Revenue': item.totalRevenue,
        'Total CGST': item.totalCGST,
        'Total SGST': item.totalSGST,
        'Total IGST': item.totalIGST,
        'Total Tax': item.totalTax,
        'CGST Rate': '2.5%',
        'SGST Rate': '2.5%',
        'IGST Rate': '5.0%'
      }));

    default:
      return [{ 'Data': JSON.stringify(data, null, 2) }];
  }
}

function formatDate(dateObj) {
  if (!dateObj) return 'N/A';
  
  if (typeof dateObj === 'object' && dateObj.year && dateObj.month) {
    if (dateObj.day) {
      return `${dateObj.year}-${dateObj.month.toString().padStart(2, '0')}-${dateObj.day.toString().padStart(2, '0')}`;
    }
    return `${dateObj.year}-${dateObj.month.toString().padStart(2, '0')}`;
  }
  
  return new Date(dateObj).toISOString().split('T')[0];
}

function formatMetricName(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

function formatValue(value) {
  if (typeof value === 'number') {
    return value.toFixed(2);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

function formatColumnName(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}

// Create Excel with multiple sheets for complex reports
export const createMultiSheetExcel = async (reportData, filename) => {
  try {
    const workbook = XLSX.utils.book_new();

    // Add different sheets for different data types
    Object.entries(reportData).forEach(([sheetName, sheetData]) => {
      if (Array.isArray(sheetData) && sheetData.length > 0) {
        const worksheet = XLSX.utils.json_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      }
    });

    // Generate file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const excelFilename = `${filename}_${timestamp}.xlsx`;
    const filePath = path.join(process.cwd(), 'temp', 'reports', excelFilename);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write Excel file
    XLSX.writeFile(workbook, filePath);

    const stats = fs.statSync(filePath);

    return {
      filename: excelFilename,
      originalName: excelFilename,
      path: filePath,
      size: stats.size,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      format: 'excel'
    };

  } catch (error) {
    console.error('Error creating multi-sheet Excel:', error);
    throw new Error('Failed to create multi-sheet Excel report');
  }
};
