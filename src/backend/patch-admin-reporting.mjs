import { readFileSync, writeFileSync } from 'fs';

// Fix advancedReportingController.js
// Change commission calculation base from $total to $subtotal
// This is reporting-only (display) — no financial records are written
const advFile = 'd:/projects/food/vinsta/backend/controllers/admin/advancedReportingController.js';
let content = readFileSync(advFile, 'utf8');

// Replace ALL instances of the commission multiply pattern:
// $multiply: ['$total', { $divide: ['$commissionPercent', 100] }]
// → $multiply: ['$subtotal', { $divide: ['$commissionPercent', 100] }]
const before = `$multiply: ['$total', { $divide: ['$commissionPercent', 100] }]`;
const after  = `$multiply: ['$subtotal', { $divide: ['$commissionPercent', 100] }]`;

const count = (content.match(new RegExp(before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
content = content.split(before).join(after);
writeFileSync(advFile, content, 'utf8');
console.log(`advancedReportingController.js: replaced ${count} commission instances ($total → $subtotal)`);

// Fix adminPaymentController.js
// Change commission calculation at line 582: order.total * commissionPercent% → order.subtotal * commissionPercent%
// And fix aggregation lines 632, 633, 635, 823, 824, 992, 1028 that use $total for commission
const payFile = 'd:/projects/food/vinsta/backend/controllers/admin/adminPaymentController.js';
let payContent = readFileSync(payFile, 'utf8');

// Fix 1: JS forEach loop at line ~582: order.total * (commissionPercent / 100)
const p1before = 'commissionTotal += order.total * (commissionPercent / 100);';
const p1after  = 'commissionTotal += (order.subtotal || 0) * (commissionPercent / 100); // use subtotal as commission base';
const c1 = (payContent.match(new RegExp(p1before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
payContent = payContent.split(p1before).join(p1after);
console.log(`adminPaymentController.js forEach commission: replaced ${c1} instances`);

// Fix 2: $addFields commissionAmount and vendorAmount at ~lines 632–635 (all use $totalRevenue which is already sum of $total not $subtotal)
// These are restaurant-breakdown aggregations — commissionAmount = totalRevenue × commissionPercent%
// totalRevenue here is sum of order.total (customer-facing). We must change the aggregation to sum $subtotal instead.
// The $group for restaurantBreakdown uses totalRevenue: { $sum: '$total' } — we need to add a subtotalRevenue alongside it.
// Rather than rewrite the whole aggregation, add a subtotalRevenue field and use that for commission.
const p2before = `totalRevenue: { $sum: '$total' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
          gstTotal: { $sum: '$gstAndPackaging' },
          platformFeeTotal: { $sum: '$platformFee' },
          deliveryFeeTotal: { $sum: '$deliveryFee' },
        },
      },
      {\n        $lookup: {`;
const p2after = `totalRevenue: { $sum: '$total' },
          subtotalRevenue: { $sum: '$subtotal' }, // vendor food revenue base for commission
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$total' },
          gstTotal: { $sum: '$gstAndPackaging' },
          platformFeeTotal: { $sum: '$platformFee' },
          deliveryFeeTotal: { $sum: '$deliveryFee' },
        },
      },
      {\n        $lookup: {`;
const c2 = (payContent.match(new RegExp(p2before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
payContent = payContent.split(p2before).join(p2after);
console.log(`adminPaymentController.js restaurant breakdown $group: patched ${c2} instance(s) to include subtotalRevenue`);

// Fix 3: $addFields commissionAmount — change $totalRevenue to $subtotalRevenue
const p3before = `commissionAmount: { $multiply: ['$totalRevenue', { $divide: ['$commissionPercent', 100] }] },
          vendorAmount: { $subtract: ['$totalRevenue', { $multiply: ['$totalRevenue', { $divide: ['$commissionPercent', 100] }] }] },
          adminProfit: { $add: [\n            { $multiply: ['$totalRevenue', { $divide: ['$commissionPercent', 100] }] },`;
const p3after = `commissionAmount: { $multiply: ['$subtotalRevenue', { $divide: ['$commissionPercent', 100] }] },
          vendorAmount: { $subtract: ['$subtotalRevenue', { $multiply: ['$subtotalRevenue', { $divide: ['$commissionPercent', 100] }] }] },
          adminProfit: { $add: [\n            { $multiply: ['$subtotalRevenue', { $divide: ['$commissionPercent', 100] }] },`;
const c3 = (payContent.match(new RegExp(p3before.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
payContent = payContent.split(p3before).join(p3after);
console.log(`adminPaymentController.js $addFields commission: patched ${c3} instance(s)`);

writeFileSync(payFile, payContent, 'utf8');
console.log('Done. Verifying...');

// Verify
const verifyAdv = readFileSync(advFile, 'utf8');
const remaining = (verifyAdv.match(/\$multiply.*\$total.*commissionPercent/g) || []).length;
console.log(`advancedReportingController remaining wrong patterns: ${remaining}`);
