import { readFileSync, writeFileSync } from 'fs';

const file = 'd:/projects/food/vinsta/backend/controllers/admin/vendorSettlementController.js';
let content = readFileSync(file, 'utf8');

const before = `    const commissionPercent = restaurant.commissionPercent || 10;
    const gstPercent = restaurant.gstInfo?.gstPercentage || 5;
    const platformFeePercent = 2;

    const settlementItems = orders.map(order => {
      const grossAmount = order.total;
      const commissionAmount = Math.round(grossAmount * (commissionPercent / 100));
      const gstAmount = Math.round(grossAmount * (gstPercent / 100));
      const platformFee = Math.round(grossAmount * (platformFeePercent / 100));
      const netAmount = grossAmount - commissionAmount - gstAmount - platformFee;
      
      const cancellationPenalty = order.status === 'Cancelled' ? 
        Math.round(grossAmount * 0.1) : 0;

      return {\n        orderId: order._id,\n        orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),\n        orderDate: order.createdAt,\n        grossAmount,
        commissionAmount,
        gstAmount,
        platformFee,
        netAmount: netAmount - cancellationPenalty,
        cancellationPenalty,
        adjustmentAmount: 0,
        adjustmentReason: cancellationPenalty > 0 ? 'Order cancellation penalty' : undefined,
      };
    });`;

const after = `    const commissionPercent = restaurant.commissionPercent || 10;
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

      return {\n        orderId: order._id,\n        orderNumber: order.orderNumber || deriveOrderNumberFromId(order._id),\n        orderDate: order.createdAt,\n        grossAmount,
        commissionAmount,
        gstAmount,
        platformFee: 0, // platform fee stays with platform
        netAmount: netAmount - cancellationPenalty,
        cancellationPenalty,
        adjustmentAmount: 0,
        adjustmentReason: cancellationPenalty > 0 ? 'Order cancellation penalty' : undefined,
      };
    });`;

// Normalize line endings for comparison
const normalizedContent = content.replace(/\r\n/g, '\n');
const normalizedBefore = before.replace(/\r\n/g, '\n');
const normalizedAfter = after.replace(/\r\n/g, '\n');

if (!normalizedContent.includes(normalizedBefore)) {
  // Try to find what IS there for the key lines
  const lines = normalizedContent.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('grossAmount = order') || line.includes('platformFeePercent')) {
      console.log(`Line ${i+1}: ${line}`);
    }
  });
  console.error('MATCH FAILED — key block not found in file. See lines above.');
  process.exit(1);
}

const newContent = normalizedContent.replace(normalizedBefore, normalizedAfter);

// Write back preserving original line endings if CRLF
const finalContent = content.includes('\r\n') ? newContent.replace(/\n/g, '\r\n') : newContent;
writeFileSync(file, finalContent, 'utf8');

console.log('✅ vendorSettlementController.js patched successfully');

// Verify
const verify = readFileSync(file, 'utf8');
if (verify.includes('order.subtotal') && !verify.includes('order.total;\n') && !verify.includes('order.total;\r\n')) {
  console.log('✅ Verification passed: order.subtotal is now used');
} else {
  console.log('⚠️ Verification uncertain — check file manually');
}
