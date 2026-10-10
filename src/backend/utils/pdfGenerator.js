/**
 * PDF Generator Utility - Simple text-based approach
 * Generates basic PDF invoices without external dependencies
 */

import fs from 'fs';
import path from 'path';

export const generateInvoicePDF = (invoiceData) => {
  try {
    console.log('📄 [PDF] Starting PDF generation for invoice:', invoiceData.invoiceNumber);
    
    // Create a simple PDF using basic PDF format
    const pdfContent = generatePDFContent(invoiceData);
    const pdfBuffer = Buffer.from(pdfContent, 'binary');
    
    console.log('📄 [PDF] Generated PDF using simple method, size:', pdfBuffer.length);
    console.log('📄 [PDF] PDF header:', pdfBuffer.toString('ascii', 0, 10));
    console.log('📄 [PDF] Buffer type:', typeof pdfBuffer);
    console.log('📄 [PDF] Buffer constructor:', pdfBuffer.constructor.name);
    
    // DEBUG: Save PDF to file for testing
    try {
      const debugDir = path.join(process.cwd(), 'debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }
      const debugFile = path.join(debugDir, `debug-invoice-${invoiceData.invoiceNumber || 'test'}.pdf`);
      fs.writeFileSync(debugFile, pdfBuffer);
      console.log('📄 [DEBUG] PDF saved to:', debugFile);
    } catch (debugError) {
      console.log('📄 [DEBUG] Could not save debug file:', debugError.message);
    }
    
    return pdfBuffer;
  } catch (error) {
    console.error('❌ [PDF] Error generating PDF:', error);
    throw new Error(`Failed to generate PDF: ${error.message}`);
  }
};

function generatePDFContent(invoiceData) {
  // Simple PDF content generation
  const lines = [];
  
  // PDF Header
  lines.push('%PDF-1.4');
  
  // Catalog object
  lines.push('1 0 obj');
  lines.push('<<');
  lines.push('/Type /Catalog');
  lines.push('/Pages 2 0 R');
  lines.push('>>');
  lines.push('endobj');
  
  // Pages object
  lines.push('2 0 obj');
  lines.push('<<');
  lines.push('/Type /Pages');
  lines.push('/Kids [3 0 R]');
  lines.push('/Count 1');
  lines.push('>>');
  lines.push('endobj');
  
  // Page object
  lines.push('3 0 obj');
  lines.push('<<');
  lines.push('/Type /Page');
  lines.push('/Parent 2 0 R');
  lines.push('/MediaBox [0 0 612 792]');
  lines.push('/Contents 4 0 R');
  lines.push('/Resources <<');
  lines.push('/Font <<');
  lines.push('/F1 5 0 R');
  lines.push('>>');
  lines.push('>>');
  lines.push('>>');
  lines.push('endobj');
  
  // Content stream
  const content = generateContentStream(invoiceData);
  lines.push('4 0 obj');
  lines.push('<<');
  lines.push(`/Length ${content.length}`);
  lines.push('>>');
  lines.push('stream');
  lines.push(content);
  lines.push('endstream');
  lines.push('endobj');
  
  // Font object
  lines.push('5 0 obj');
  lines.push('<<');
  lines.push('/Type /Font');
  lines.push('/Subtype /Type1');
  lines.push('/BaseFont /Helvetica');
  lines.push('>>');
  lines.push('endobj');
  
  // Cross-reference table
  const xrefOffset = lines.join('\n').length + 1; // +1 for final newline
  lines.push('xref');
  lines.push('0 6');
  lines.push('0000000000 65535 f');
  
  let currentOffset = 0;
  const pdfText = lines.join('\n');
  for (let i = 1; i <= 5; i++) {
    const objStart = pdfText.indexOf(`${i} 0 obj`);
    if (objStart !== -1) {
      lines.push(`${objStart.toString().padStart(10, '0')} 00000 n`);
    }
  }
  
  // Trailer
  lines.push('trailer');
  lines.push('<<');
  lines.push('/Size 6');
  lines.push('/Root 1 0 R');
  lines.push('>>');
  lines.push(`startxref`);
  lines.push(xrefOffset.toString());
  lines.push('%%EOF');
  
  return lines.join('\n');
}

function generateContentStream(invoiceData) {
  const content = [];
  
  // Start text stream
  content.push('BT');
  content.push('/F1 16 Tf');
  
  let y = 750;
  
  // Title
  content.push('200 ' + y + ' Td');
  content.push('(INVOICE) Tj');
  y -= 30;
  
  // Invoice details
  content.push('/F1 12 Tf');
  content.push('50 ' + y + ' Td');
  content.push(`(Invoice Number: ${invoiceData.invoiceNumber || 'N/A'}) Tj`);
  y -= 20;
  
  content.push('50 ' + y + ' Td');
  content.push(`(Date: ${new Date().toLocaleDateString()}) Tj`);
  y -= 20;
  
  content.push('50 ' + y + ' Td');
  content.push(`(Customer: ${invoiceData.customerId?.name || 'Customer'}) Tj`);
  y -= 20;
  
  content.push('50 ' + y + ' Td');
  content.push(`(Address: ${invoiceData.billingAddress?.fullAddress || 'N/A'}) Tj`);
  y -= 40;
  
  // Items
  content.push('/F1 14 Tf');
  content.push('50 ' + y + ' Td');
  content.push('(Items:) Tj');
  y -= 25;
  
  content.push('/F1 12 Tf');
  if (invoiceData.lineItems && invoiceData.lineItems.length > 0) {
    invoiceData.lineItems.forEach((item) => {
      content.push('70 ' + y + ' Td');
      content.push(`(${item.quantity}x ${item.description} - $${item.price.toFixed(2)} = $${item.total.toFixed(2)}) Tj`);
      y -= 20;
    });
  } else {
    content.push('70 ' + y + ' Td');
    content.push('(No items found) Tj');
    y -= 20;
  }
  
  // Totals
  y -= 20;
  content.push('/F1 14 Tf');
  content.push('50 ' + y + ' Td');
  content.push(`(Subtotal: $${(invoiceData.subtotal || 0).toFixed(2)}) Tj`);
  y -= 25;
  
  content.push('50 ' + y + ' Td');
  content.push(`(Tax: $${(invoiceData.taxAmount || 0).toFixed(2)}) Tj`);
  y -= 25;
  
  content.push('50 ' + y + ' Td');
  content.push(`(Total: $${(invoiceData.grandTotal || 0).toFixed(2)}) Tj`);
  
  // End text stream
  content.push('ET');
  
  return content.join('\n');
}
