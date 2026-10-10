/**
 * PDF Report Generator Utility
 * Converts report data to professional PDF format using jsPDF
 */

import jsPDF from 'jspdf';
import fs from 'fs';
import path from 'path';

export const generatePDFReport = async (data, type, filename) => {
  try {
    // Create PDF using jsPDF
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Add content to PDF
    let yPosition = 20;

    // Header
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`${filename} - ${type.toUpperCase()} REPORT`, 105, yPosition, { align: 'center' });
    yPosition += 15;
    
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 105, yPosition, { align: 'center' });
    yPosition += 20;

    // Summary section
    if (data.summary) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('Executive Summary', 20, yPosition);
      yPosition += 10;

      Object.entries(data.summary).forEach(([key, value]) => {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        const label = formatMetricName(key);
        const formattedValue = formatValue(value);
        pdf.text(`${label}: ${formattedValue}`, 20, yPosition);
        yPosition += 6;
      });
      yPosition += 10;
    }

    // Data section
    if (data.details && data.details.length > 0) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(12);
      pdf.text('Detailed Data', 20, yPosition);
      yPosition += 10;

      const headers = getTableHeaders(type);
      const colWidths = calculateColumnWidths(type);
      
      // Table headers
      let xPos = 20;
      headers.forEach((header, index) => {
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.text(header, xPos, yPosition);
        xPos += colWidths[index];
      });
      yPosition += 8;

      // Table rows (limit to first 20 for space)
      const rowsToShow = data.details.slice(0, 20);
      rowsToShow.forEach((item) => {
        xPos = 20;
        const row = formatTableRow(item, type);
        
        row.forEach((cell, index) => {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8);
          const truncatedCell = cell.length > 20 ? cell.substring(0, 17) + '...' : cell;
          pdf.text(truncatedCell, xPos, yPosition);
          xPos += colWidths[index];
        });
        yPosition += 6;
      });

      if (data.details.length > 20) {
        pdf.setFont('helvetica', 'italic');
        pdf.setFontSize(8);
        pdf.text(`... and ${data.details.length - 20} more records`, 20, yPosition);
        yPosition += 8;
      }
    }

    // Footer
    yPosition = 270;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.text('This report was generated automatically by Vinsta Admin Dashboard', 105, yPosition, { align: 'center' });
    yPosition += 5;
    pdf.text('For any questions, please contact support@vinsta.com', 105, yPosition, { align: 'center' });

    // Save PDF
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const pdfFilename = `${filename}_${timestamp}.pdf`;
    const filePath = path.join(process.cwd(), 'temp', 'reports', pdfFilename);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    pdf.save(filePath);

    const stats = fs.statSync(filePath);

    return {
      filename: pdfFilename,
      originalName: pdfFilename,
      path: filePath,
      size: stats.size,
      mimeType: 'application/pdf',
      format: 'pdf'
    };

  } catch (error) {
    console.error('Error generating PDF report:', error);
    throw new Error('Failed to generate PDF report');
  }
};

function getTableHeaders(type) {
  const headers = {
    revenue: ['Date', 'Revenue', 'Orders', 'Avg Order'],
    orders: ['Order ID', 'Customer', 'Status', 'Total'],
    vendors: ['Vendor', 'Orders', 'Revenue', 'Commission'],
    riders: ['Rider', 'Orders', 'Success Rate', 'Earnings'],
    payments: ['Transaction ID', 'Type', 'Amount', 'Status'],
    invoices: ['Invoice #', 'Customer', 'Status', 'Total'],
    customers: ['Customer', 'Orders', 'Total Spent', 'Avg Order'],
    financial: ['Transaction ID', 'Type', 'Amount', 'Date'],
    tax: ['Period', 'Revenue', 'CGST', 'SGST', 'Total Tax']
  };
  return headers[type] || ['Data'];
}

function calculateColumnWidths(type) {
  const widths = {
    revenue: [40, 40, 30, 30],
    orders: [30, 40, 30, 30],
    vendors: [40, 25, 25, 25],
    riders: [35, 25, 25, 30],
    payments: [35, 25, 25, 30],
    invoices: [35, 35, 25, 30],
    customers: [35, 25, 25, 30],
    financial: [35, 25, 25, 30],
    tax: [25, 25, 20, 20, 25]
  };
  return widths[type] || [50, 50, 50, 50];
}

function formatTableRow(item, type) {
  switch (type) {
    case 'revenue':
      return [
        item._id || '',
        `₹${(item.totalRevenue || 0).toFixed(2)}`,
        item.totalOrders?.toString() || '0',
        `₹${(item.averageOrderValue || 0).toFixed(2)}`
      ];
    case 'orders':
      return [
        item._id?.slice(-8) || '',
        item.userId?.name || 'N/A',
        item.status || 'N/A',
        `₹${(item.total || 0).toFixed(2)}`
      ];
    case 'vendors':
      return [
        item.vendor?.name || 'N/A',
        item.totalOrders?.toString() || '0',
        `₹${(item.totalRevenue || 0).toFixed(2)}`,
        `${item.vendor?.commissionPercent || 0}%`
      ];
    case 'riders':
      return [
        item.rider?.name || 'N/A',
        item.totalOrders?.toString() || '0',
        `${(item.successRate || 0).toFixed(1)}%`,
        `₹${(item.totalEarnings || 0).toFixed(2)}`
      ];
    case 'payments':
      return [
        item.transactionId || 'N/A',
        item.type || 'N/A',
        `₹${(item.amount || 0).toFixed(2)}`,
        item.status || 'N/A'
      ];
    case 'invoices':
      return [
        item.invoiceNumber || 'N/A',
        item.customerId?.name || 'N/A',
        item.status || 'N/A',
        `₹${(item.grandTotal || 0).toFixed(2)}`
      ];
    case 'customers':
      return [
        item.customer?.name || 'N/A',
        item.totalOrders?.toString() || '0',
        `₹${(item.totalSpent || 0).toFixed(2)}`,
        `₹${(item.averageOrderValue || 0).toFixed(2)}`
      ];
    case 'financial':
      return [
        item.transactionId || 'N/A',
        item.type || 'N/A',
        `₹${(item.amount || 0).toFixed(2)}`,
        new Date(item.createdAt).toLocaleDateString()
      ];
    case 'tax':
      return [
        `${item._id?.year || ''}-${item._id?.month?.toString().padStart(2, '0') || ''}`,
        `₹${(item.totalRevenue || 0).toFixed(2)}`,
        `₹${(item.totalCGST || 0).toFixed(2)}`,
        `₹${(item.totalSGST || 0).toFixed(2)}`,
        `₹${(item.totalTax || 0).toFixed(2)}`
      ];
    default:
      return ['N/A', 'N/A', 'N/A', 'N/A'];
  }
}

function formatValue(value) {
  if (typeof value === 'number') {
    return value % 1 === 0 ? value : value.toFixed(2);
  }
  return value;
}

function formatMetricName(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
}
