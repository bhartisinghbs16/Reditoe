/**
 * CSV Report Generator Utility
 * Converts report data to CSV format
 */

import fs from 'fs';
import path from 'path';

export const generateCSVReport = async (data, type, filename) => {
  try {
    const csvContent = convertToCSV(data, type);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const csvFilename = `${filename}_${timestamp}.csv`;
    const filePath = path.join(process.cwd(), 'temp', 'reports', csvFilename);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write CSV file
    fs.writeFileSync(filePath, csvContent, 'utf8');

    const stats = fs.statSync(filePath);

    return {
      filename: csvFilename,
      originalName: csvFilename,
      path: filePath,
      size: stats.size,
      mimeType: 'text/csv',
      format: 'csv'
    };

  } catch (error) {
    console.error('Error generating CSV report:', error);
    throw new Error('Failed to generate CSV report');
  }
};

function convertToCSV(data, type) {
  let csvContent = '';
  let headers = [];
  let rows = [];

  switch (type) {
    case 'revenue':
      headers = ['Date', 'Total Revenue', 'Total Orders', 'Average Order Value', 'Total Tax', 'Delivery Fee', 'Platform Fee'];
      rows = data.details.map(item => [
        formatDate(item._id),
        item.totalRevenue.toFixed(2),
        item.totalOrders,
        item.averageOrderValue.toFixed(2),
        item.totalTax.toFixed(2),
        item.totalDeliveryFee.toFixed(2),
        item.totalPlatformFee.toFixed(2)
      ]);
      break;

    case 'orders':
      headers = ['Order ID', 'Customer', 'Restaurant', 'Status', 'Payment Method', 'Total', 'Created Date'];
      rows = data.details.map(order => [
        order._id,
        order.userId?.name || 'N/A',
        order.restaurantId?.name || 'N/A',
        order.status,
        order.paymentMethod,
        order.total.toFixed(2),
        order.createdAt.toISOString()
      ]);
      break;

    case 'vendors':
      headers = ['Vendor Name', 'Total Orders', 'Total Revenue', 'Average Order Value', 'Commission %'];
      rows = data.details.map(item => [
        item.vendor?.name || 'N/A',
        item.totalOrders,
        item.totalRevenue.toFixed(2),
        item.averageOrderValue.toFixed(2),
        item.vendor?.commissionPercent || 0
      ]);
      break;

    case 'riders':
      headers = ['Rider Name', 'Total Orders', 'Completed Orders', 'Success Rate %', 'Total Earnings', 'Vehicle'];
      rows = data.details.map(item => [
        item.rider?.name || 'N/A',
        item.totalOrders,
        item.completedOrders,
        item.successRate.toFixed(2),
        item.totalEarnings.toFixed(2),
        item.rider?.vehicleName || 'N/A'
      ]);
      break;

    case 'payments':
      headers = ['Transaction ID', 'Type', 'Amount', 'Status', 'Payment Method', 'Date'];
      rows = data.details.map(payment => [
        payment.transactionId || 'N/A',
        payment.type,
        payment.amount.toFixed(2),
        payment.status,
        payment.paymentMethod || 'N/A',
        payment.createdAt.toISOString()
      ]);
      break;

    case 'invoices':
      headers = ['Invoice Number', 'Customer', 'Vendor', 'Status', 'Total Amount', 'Tax Amount', 'Issue Date'];
      rows = data.details.map(invoice => [
        invoice.invoiceNumber,
        invoice.customerId?.name || 'N/A',
        invoice.vendorId?.name || 'N/A',
        invoice.status,
        invoice.grandTotal.toFixed(2),
        invoice.taxAmount.toFixed(2),
        invoice.issueDate.toISOString()
      ]);
      break;

    case 'customers':
      headers = ['Customer Name', 'Total Orders', 'Total Spent', 'Average Order Value', 'Customer Since', 'Last Order'];
      rows = data.details.map(item => [
        item.customer?.name || 'N/A',
        item.totalOrders,
        item.totalSpent.toFixed(2),
        item.averageOrderValue.toFixed(2),
        item.customerSince?.toISOString() || 'N/A',
        item.lastOrder?.toISOString() || 'N/A'
      ]);
      break;

    case 'financial':
      headers = ['Transaction ID', 'Type', 'Amount', 'Commission', 'Vendor Amount', 'GST', 'Platform Fee', 'Date'];
      rows = data.details.map(transaction => [
        transaction.transactionId || 'N/A',
        transaction.type,
        transaction.amount.toFixed(2),
        transaction.commissionAmount.toFixed(2),
        transaction.vendorAmount.toFixed(2),
        transaction.gstAmount.toFixed(2),
        transaction.platformFee.toFixed(2),
        transaction.createdAt.toISOString()
      ]);
      break;

    case 'tax':
      headers = ['Period', 'Total Revenue', 'CGST Amount', 'SGST Amount', 'IGST Amount', 'Total Tax'];
      rows = data.details.map(item => [
        `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
        item.totalRevenue.toFixed(2),
        item.totalCGST.toFixed(2),
        item.totalSGST.toFixed(2),
        item.totalIGST.toFixed(2),
        item.totalTax.toFixed(2)
      ]);
      break;

    default:
      headers = ['Data'];
      rows = [[JSON.stringify(data)]];
  }

  // Add summary section at the top
  if (data.summary) {
    csvContent += '# Summary\n';
    Object.entries(data.summary).forEach(([key, value]) => {
      csvContent += `${key},${value}\n`;
    });
    csvContent += '\n# Detailed Data\n';
  }

  // Add headers
  csvContent += headers.join(',') + '\n';

  // Add rows
  rows.forEach(row => {
    csvContent += row.map(cell => {
      // Escape commas and quotes in cell values
      if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
        return `"${cell.replace(/"/g, '""')}"`;
      }
      return cell;
    }).join(',') + '\n';
  });

  return csvContent;
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

// Generate CSV for chart data
export const generateChartCSV = (chartData, chartTitle) => {
  if (!chartData || !chartData.length) return '';

  let csvContent = `# ${chartTitle}\n`;
  
  // Get headers from first data point
  const headers = Object.keys(chartData[0]);
  csvContent += headers.join(',') + '\n';

  // Add data rows
  chartData.forEach(item => {
    const row = headers.map(header => {
      let value = item[header];
      if (typeof value === 'object') value = JSON.stringify(value);
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        value = `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    });
    csvContent += row.join(',') + '\n';
  });

  return csvContent;
};
