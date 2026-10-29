/**
 * The customer's combined billing document for one delivered order.
 *
 *   page 1  Customer order bill      what the customer paid, and what for
 *   page 2  Restaurant tax invoice   issued by Reditoe on behalf of the restaurant
 *   page 3  Reditoe tax invoice      the platform fee, invoiced by Reditoe
 *
 * Every figure is read off the order as it was charged. Nothing is recomputed
 * from today's settings, so a bill printed next year says what was billed.
 */
import {
  COLOR, PAGE, createDocument, finish, text, wrap, rect, line, letterhead, footer,
  amountInWords, money, round2, formatDate, formatDateTime, companyIdentity,
} from './pdfBase.js';

const FOOTER_LABEL =
  'REDITOE • Combined Billing Document • Customer Bill | Restaurant Settlement | Restaurant Tax Invoice';

const PLATFORM_FEE_GST_RATE = 18;
const DELIVERY_GST_RATE = 18;

const joinAddress = (...parts) => parts.map((p) => String(p || '').trim()).filter(Boolean).join(', ');

const restaurantAddress = (r) => {
  const a = r?.address || {};
  return joinAddress(a.street, a.city, a.state, a.zipCode);
};

const customerAddress = (order) => {
  const a = order.deliveryAddress || {};
  return joinAddress(a.street, a.city, a.state, a.zipCode);
};

/** When the order was handed over: the timeline says, the last update is the fallback. */
export function deliveredAt(order) {
  const stamp = (order.timeline || [])
    .filter((entry) => entry?.status === 'Delivered')
    .map((entry) => entry.timestamp)
    .filter(Boolean)
    .pop();
  return stamp || order.updatedAt || order.createdAt;
}

/**
 * Splits `total` across `weights` so the parts add up to it exactly; the
 * rounding remainder lands on the last part rather than going missing.
 */
function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!weights.length) return [];
  let left = round2(total);
  return weights.map((weight, index) => {
    if (index === weights.length - 1) return left;
    const share = sum > 0 ? round2((total * weight) / sum) : 0;
    left = round2(left - share);
    return share;
  });
}

export function buildInvoiceData(order, { restaurant, customer }) {
  const subtotal = round2(order.subtotal);
  const discount = round2(order.discount);
  const packing = round2(order.packagingFee);
  const platformFee = round2(order.platformFee);
  const deliveryFee = round2(order.deliveryFee);
  const tip = round2(order.tip);
  const walletUsed = round2(order.walletUsed);

  const foodGst = round2(order.tax);
  const platformGst = round2((platformFee * PLATFORM_FEE_GST_RATE) / 100);
  const storedGst = round2(order.gstAndPackaging ?? order.tax);
  // Whatever GST the order carried beyond the food and platform fee was the delivery fee's.
  const deliveryGst = Math.max(0, round2(storedGst - foodGst - platformGst));
  // The order never charged GST on packing, so none is shown against it.
  const packingGst = 0;
  const totalGst = round2(foodGst + platformGst + deliveryGst + packingGst);

  const orderTotal = round2(order.total + walletUsed);
  const foodRate = subtotal > 0 ? round2((foodGst / subtotal) * 100) : 0;

  const vendorFunded = order.discountFundedBy === 'vendor';
  const items = (order.items || []).map((item) => ({
    name: item.name || 'Item',
    qty: Number(item.quantity) || 1,
    rate: round2(item.price),
  }));
  const grossByLine = items.map((item) => round2(item.rate * item.qty));
  const discounts = allocate(vendorFunded ? discount : 0, grossByLine);
  const gstByLine = allocate(foodGst, grossByLine);

  const lines = items.map((item, i) => {
    const net = round2(grossByLine[i] - discounts[i]);
    const half = round2(gstByLine[i] / 2);
    return {
      name: item.name,
      qty: item.qty,
      rate: item.rate,
      discount: discounts[i],
      net,
      cgst: half,
      sgst: round2(gstByLine[i] - half),
      total: round2(net + gstByLine[i]),
    };
  });
  if (packing > 0) {
    lines.push({
      name: 'Packing fee', qty: 1, rate: packing, discount: 0, net: packing, cgst: 0, sgst: 0, total: packing,
    });
  }

  const sum = (key) => round2(lines.reduce((acc, l) => acc + l[key], 0));
  const restaurantTotals = { net: sum('net'), cgst: sum('cgst'), sgst: sum('sgst'), total: sum('total') };

  const platformHalf = round2(platformGst / 2);
  const platformLine = {
    name: 'Platform fee',
    qty: 1,
    rate: platformFee,
    discount: 0,
    net: platformFee,
    cgst: platformHalf,
    sgst: round2(platformGst - platformHalf),
    total: round2(platformFee + platformGst),
  };

  const company = companyIdentity();
  const deliveryState = order.deliveryAddress?.state || '';
  const when = deliveredAt(order);
  const ref = order.orderNumber || String(order._id).slice(-8).toUpperCase();
  const gstin = restaurant?.gstInfo?.gstNumber || restaurant?.kycDocuments?.gst || '';

  return {
    orderRef: ref,
    orderTime: formatDateTime(order.createdAt),
    invoiceDate: formatDate(when),
    deliveredAt: when,
    paymentMethod: order.paymentMethod === 'cod' ? 'Cash on delivery'
      : order.paymentMethod === 'wallet' ? 'Wallet'
        : 'Online',
    company,
    customer: {
      name: customer?.name || 'Customer',
      phone: customer?.phone || '',
      address: customerAddress(order),
      state: deliveryState,
    },
    restaurant: {
      name: restaurant?.name || 'Restaurant',
      address: restaurantAddress(restaurant),
      state: restaurant?.address?.state || '',
      gstin,
      fssai: restaurant?.kycDocuments?.fssai || restaurant?.fssaiNumber || '',
    },
    summary: {
      subtotal, discount, packing, platformFee, deliveryFee, tip, totalGst, orderTotal, walletUsed,
      payNow: round2(order.total),
    },
    gstBreakdown: [
      { label: 'Food items', rate: foodRate, amount: foodGst, applies: true },
      { label: 'Packing (if applicable)', rate: 0, amount: packingGst, applies: packing > 0 && packingGst > 0 },
      { label: 'Platform fee (if applicable)', rate: PLATFORM_FEE_GST_RATE, amount: platformGst, applies: platformFee > 0 },
      { label: 'Delivery fee (if applicable)', rate: DELIVERY_GST_RATE, amount: deliveryGst, applies: deliveryFee > 0 },
    ],
    totalGst,
    foodRate,
    lines,
    restaurantTotals,
    restaurantInvoiceNumber: `RTI-${ref}`,
    platformLine,
    platformTotals: {
      net: platformLine.net, cgst: platformLine.cgst, sgst: platformLine.sgst, total: platformLine.total,
    },
    platformInvoiceNumber: `RDI-${ref}`,
    platformRate: PLATFORM_FEE_GST_RATE,
  };
}

/* ── Shared pieces ──────────────────────────────────────────────────────── */

const rupee = (v) => `₹ ${money(v)}`;

function headerRow(doc, { x, y, h, cols, labels }) {
  labels.forEach((label, i) => {
    const x0 = cols[i];
    const x1 = cols[i + 1];
    rect(doc, x0, y, x1 - x0, h, { stroke: COLOR.black });
    text(doc, label, (x0 + x1) / 2, y + 9.2, { size: 7.5, bold: true, color: COLOR.muted, align: 'center', maxW: x1 - x0 - 6 });
  });
  return x;
}

/** The thin three/four-up strip of facts above the parties box (order id, dates, …). */
function metaStrip(doc, { x0, x1, y, cols, labels, values }) {
  const edges = [x0, ...cols, x1];
  headerRow(doc, { x: x0, y, h: 19.6, cols: edges, labels });
  values.forEach((value, i) => {
    const a = edges[i];
    const b = edges[i + 1];
    rect(doc, a, y + 19.6, b - a, 20, { stroke: COLOR.black });
    text(doc, value, (a + b) / 2, y + 19.6 + 10, { size: 8, bold: true, color: COLOR.slate, align: 'center', maxW: b - a - 8 });
  });
}

/** A label with its value beside it; returns the height used. */
function field(doc, label, value, x, y, valueX, valueW, { lineH = 9.6 } = {}) {
  text(doc, label, x, y, { size: 7.5, bold: true, color: COLOR.muted });
  const lines = wrap(doc, value || '-', valueW, { size: 7.5, bold: true }).slice(0, 3);
  lines.forEach((l, i) => text(doc, l, valueX, y + i * lineH, { size: 7.5, bold: true, color: COLOR.slate }));
  return Math.max(14.2, lines.length * lineH + 4.6);
}

function partiesBox(doc, { y, h, left, right }) {
  const x0 = 31.8;
  const mid = 305.8;
  const x1 = 580.2;
  rect(doc, x0, y, x1 - x0, h, { stroke: COLOR.black });
  line(doc, mid, y, mid, y + h);
  text(doc, left.title, (x0 + mid) / 2, y + 5, { size: 7.5, bold: true, color: COLOR.muted, align: 'center' });
  text(doc, right.title, (mid + x1) / 2, y + 5, { size: 7.5, bold: true, color: COLOR.muted, align: 'center' });
}

/**
 * Lays rows down in a column and returns where the column ended. The box
 * around them is drawn afterwards, so it is as tall as what is inside it.
 */
function column(doc, rows, { x, valueX, valueW, startY }) {
  let y = startY;
  rows.forEach(([label, value]) => {
    y += field(doc, label, value, x, y, valueX, valueW);
  });
  return y;
}

function serviceTable(doc, { top, lines, cgstLabel, sgstLabel, netLabel, rowsMin = 0 }) {
  const cols = [31.8, 79.8, 164.8, 221.2, 262.3, 319.2, 391.0, 464.9, 510.0, 563.4];
  const headH = 29.8;

  const headers = ['SL.No', 'Particulars', 'quantity', ['Gross', 'value'], 'Discount', netLabel, cgstLabel, sgstLabel, 'Total'];
  headers.forEach((label, i) => {
    const a = cols[i];
    const b = cols[i + 1];
    rect(doc, a, top, b - a, headH, { stroke: COLOR.black });
    const parts = Array.isArray(label) ? label : [label];
    const lh = 14.6;
    const startY = top + headH / 2 - ((parts.length - 1) * lh) / 2;
    parts.forEach((part, k) => text(doc, part, (a + b) / 2, startY + k * lh, {
      size: 10.5, bold: true, color: COLOR.navy, align: 'center', maxW: b - a - 5,
    }));
  });

  let y = top + headH;
  const body = [...lines];
  while (body.length < rowsMin) body.push(null);
  body.forEach((row, index) => {
    const nameLines = row ? wrap(doc, row.name, cols[2] - cols[1] - 8, { size: 10.5, bold: true }) : [''];
    const h = Math.max(15.1, nameLines.length * 14.6 + 0.8);
    for (let c = 0; c < 9; c += 1) rect(doc, cols[c], y, cols[c + 1] - cols[c], h, { stroke: COLOR.black });
    if (row) {
      const mid = y + h / 2;
      const cell = (c, value) => text(doc, value, (cols[c] + cols[c + 1]) / 2, mid, {
        size: 10.5, bold: true, color: COLOR.navy, align: 'center', maxW: cols[c + 1] - cols[c] - 5,
      });
      cell(0, index + 1);
      nameLines.forEach((l, k) => text(doc, l, (cols[1] + cols[2]) / 2, y + h / 2 - ((nameLines.length - 1) * 14.6) / 2 + k * 14.6, {
        size: 10.5, bold: true, color: COLOR.navy, align: 'center',
      }));
      cell(2, row.qty);
      cell(3, money(row.rate));
      cell(4, money(row.discount));
      cell(5, money(row.net));
      cell(6, money(row.cgst));
      cell(7, money(row.sgst));
      cell(8, money(row.total));
    }
    y += h;
  });
  return y;
}

function totalsBlock(doc, { y, totals, cgstTitle, sgstTitle }) {
  const rows = [
    ['Net Value', totals.net],
    [cgstTitle, totals.cgst],
    [sgstTitle, totals.sgst],
    ['Total Value', totals.total],
  ];
  rows.forEach(([label, value], i) => {
    const ry = y + i * 16.8;
    text(doc, label, 391, ry, { size: 10.5, bold: true, color: COLOR.navy });
    text(doc, `= ${money(value)}`, 563.4, ry, { size: 10.5, bold: true, color: COLOR.navy, align: 'right' });
  });
  return y + rows.length * 16.8;
}

/* ── Page 1: customer order bill ────────────────────────────────────────── */

function drawBill(doc, d) {
  letterhead(doc, { gstin: d.company.gstin, pan: d.company.pan, emailLink: false, boxX: 369, boxW: 220.2, boxH: 103.2 });
  text(doc, 'CUSTOMER ORDER BILL', 306, 131.7, { size: 12, bold: true, color: COLOR.navy, align: 'center' });

  metaStrip(doc, {
    x0: 31.8, x1: 586.7, y: 156.7, cols: [216.6, 401.4],
    labels: ['Order ID', 'ORDER Time', 'Payment method'],
    values: [d.orderRef, d.orderTime, d.paymentMethod],
  });

  // Parties.
  const top = 210.8;
  const leftEnd = column(doc, [
    ['Customer Name', d.customer.name],
    ['Delivery Address', d.customer.address],
    ['Phone number', d.customer.phone],
    ['GST :', 'Unregistered'],
  ], { x: 37.4, valueX: 104, valueW: 196, startY: top + 23 });
  const rightEnd = column(doc, [
    ['Restaurant Name', d.restaurant.name],
    ['Delivery Address', d.restaurant.address],
    ['GST', d.restaurant.gstin],
    ['Fssai', d.restaurant.fssai],
  ], { x: 311.4, valueX: 386, valueW: 188, startY: top + 14.4 });
  const boxBottom = Math.max(296.8, leftEnd + 3, rightEnd + 3);
  partiesBox(doc, {
    y: top, h: boxBottom - top,
    left: { title: 'Customer' }, right: { title: 'Restaurant' },
  });
  // The column text was drawn first; redraw the frame on top so lines stay crisp.
  const dy = boxBottom - 296.8;

  // Bill summary.
  const s = d.summary;
  text(doc, 'BILL SUMMARY', 37.4, 317.5 + dy, { size: 8.5, bold: true, color: COLOR.navy });

  const tx0 = 43;
  const tx1 = 569;
  const divider = 410.4;
  let y = 326.2 + dy;
  rect(doc, tx0, y, tx1 - tx0, 16.5, { fill: COLOR.navy });
  text(doc, 'Description', 46.4, y + 8.3, { size: 7.5, bold: true, color: COLOR.white });
  text(doc, 'Amount (₹)', 565.6, y + 8.3, { size: 7.5, bold: true, color: COLOR.white, align: 'right' });
  y += 16.5;

  const rows = [['Item Total', rupee(s.subtotal)]];
  rows.push(['Less: offer / discount', s.discount > 0 ? `− ${rupee(s.discount)}` : rupee(0)]);
  if (s.packing > 0) rows.push(['Restaurant packing charges', rupee(s.packing)]);
  if (s.platformFee > 0) rows.push(['Platform fee', rupee(s.platformFee)]);
  rows.push(['Delivery fee', rupee(s.deliveryFee)]);
  if (s.tip > 0) rows.push(['Tip', rupee(s.tip)]);
  rows.push(['GST on applicable charges', rupee(s.totalGst)]);

  rows.forEach(([label, amount], i) => {
    rect(doc, tx0, y, tx1 - tx0, 16.5, { fill: i % 2 ? COLOR.band : COLOR.white, stroke: COLOR.rule });
    line(doc, divider, y, divider, y + 16.5, COLOR.rule);
    text(doc, label, 46.4, y + 8.3, { size: 7.5 });
    text(doc, amount, 565.6, y + 8.3, { size: 7.5, align: 'right' });
    y += 16.5;
  });

  // Totals sit a hair left of the table, as drawn.
  const ux0 = 34.4;
  const ux1 = 560;
  const udiv = 365.4;
  const totalRow = (label, amount, fill, bold, h, color, size) => {
    rect(doc, ux0, y, ux1 - ux0, h, { fill, stroke: COLOR.rule });
    line(doc, udiv, y, udiv, y + h, COLOR.rule);
    text(doc, label, 37.4, y + h / 2, { size, bold, color });
    text(doc, amount, 556.6, y + h / 2, { size, bold: true, color, align: 'right' });
    y += h;
  };
  y += 0.4;
  totalRow('Order total (including GST)', rupee(s.orderTotal), COLOR.band, false, 16.4, COLOR.slate, 7.5);
  totalRow('Wallet amount used', s.walletUsed > 0 ? `− ${rupee(s.walletUsed)}` : rupee(0), COLOR.band, false, 16.4, COLOR.slate, 7.5);
  totalRow('YOU PAY NOW', rupee(s.payNow), COLOR.navy, true, 18.6, COLOR.white, 9);

  // GST breakdown.
  y += 4.6;
  text(doc, 'GST BREAKDOWN', 37.4, y + 5.2, { size: 8.5, bold: true, color: COLOR.navy });
  y += 13.6;
  const gcols = [43, 309.6, 424.8, 569];
  rect(doc, gcols[0], y, gcols[3] - gcols[0], 15.9, { fill: COLOR.navy });
  ['GST applied on', 'Rate', 'GST amount (₹)'].forEach((label, i) => {
    text(doc, label, gcols[i] + 3.4, y + 8, { size: 6.9, bold: true, color: COLOR.white });
  });
  y += 15.9;

  const gstRows = d.gstBreakdown.filter((r) => r.applies);
  gstRows.forEach((r, i) => {
    rect(doc, gcols[0], y, gcols[3] - gcols[0], 15.9, { fill: i % 2 ? COLOR.band : COLOR.white, stroke: COLOR.rule });
    line(doc, gcols[1], y, gcols[1], y + 15.9, COLOR.rule);
    line(doc, gcols[2], y, gcols[2], y + 15.9, COLOR.rule);
    text(doc, r.label.replace(' (if applicable)', ''), gcols[0] + 3.4, y + 8, { size: 6.9 });
    text(doc, `${r.rate}%`, gcols[1] + 3.4, y + 8, { size: 6.9 });
    text(doc, rupee(r.amount), gcols[2] + 3.4, y + 8, { size: 6.9 });
    y += 15.9;
  });
  rect(doc, gcols[0], y, gcols[3] - gcols[0], 15.9, { fill: COLOR.total, stroke: COLOR.rule });
  line(doc, gcols[1], y, gcols[1], y + 15.9, COLOR.rule);
  line(doc, gcols[2], y, gcols[2], y + 15.9, COLOR.rule);
  text(doc, 'TOTAL GST', gcols[0] + 3.4, y + 8, { size: 6.9, bold: true });
  text(doc, '—', gcols[1] + 3.4, y + 8, { size: 6.9, bold: true });
  text(doc, rupee(d.totalGst), gcols[2] + 3.4, y + 8, { size: 6.9, bold: true });
  y += 15.9;

  text(doc, 'Packing charges and platform fees appear only when configured and applicable.', 37.4, y + 7.5, {
    size: 6.9, color: COLOR.muted,
  });

  text(doc, 'Authorised signatory: ______________________', 428.4, 696.3, { size: 7.5 });
  footer(doc, FOOTER_LABEL);
}

/* ── Pages 2 and 3: tax invoices ────────────────────────────────────────── */

function invoiceHeader(doc, d, { shift, title, invoiceNumber }) {
  letterhead(doc, { gstin: d.company.gstin, pan: d.company.pan, top: shift, boxX: 381, boxW: 220.2, boxH: 103.2 });
  text(doc, title, 306, 144.4 + shift, { size: 12, bold: true, color: COLOR.navy, align: 'center', maxW: 520 });

  const y = 169.3 + shift;
  const edges = [31.8, 131.9, 256.9, 384.5, 560.2];
  ['Order ID', 'Invoice Date', 'Invoice Number', 'Place of supply'].forEach((label, i) => {
    rect(doc, edges[i], y, edges[i + 1] - edges[i], 20.1, { stroke: COLOR.black });
    text(doc, label, (edges[i] + edges[i + 1]) / 2, y + 10.1, { size: 7.5, bold: true, color: COLOR.muted, align: 'center' });
  });
  [d.orderRef, d.invoiceDate, invoiceNumber, d.customer.state].forEach((value, i) => {
    rect(doc, edges[i], y + 20.1, edges[i + 1] - edges[i], 20, { stroke: COLOR.black });
    text(doc, value, (edges[i] + edges[i + 1]) / 2, y + 30.1, {
      size: 8, bold: true, color: COLOR.slate, align: 'center', maxW: edges[i + 1] - edges[i] - 8,
    });
  });
}

function drawRestaurantInvoice(doc, d) {
  const shift = 0;
  invoiceHeader(doc, d, {
    shift,
    title: `Tax Invoice On behalf of ${d.restaurant.name}`,
    invoiceNumber: d.restaurantInvoiceNumber,
  });

  const top = 225.4;
  const leftEnd = column(doc, [
    ['Name', d.restaurant.name],
    ['Address', d.restaurant.address],
    ['GST :', d.restaurant.gstin],
    ['Fssai', d.restaurant.fssai],
    ['State', d.restaurant.state],
  ], { x: 37.4, valueX: 80, valueW: 218, startY: top + 19.6 });
  const rightEnd = column(doc, [
    ['Name', d.customer.name],
    ['Address', d.customer.address],
    ['State', d.customer.state],
  ], { x: 311.4, valueX: 350, valueW: 222, startY: top + 33.8 });
  const bottom = Math.max(311.3, leftEnd + 3, rightEnd + 3);
  partiesBox(doc, { y: top, h: bottom - top, left: { title: 'Supplier (Restaurant)' }, right: { title: 'Billed To (Customer)' } });
  const dy = bottom - 311.3;

  text(doc, 'Service Details', 37.4, 352 + dy, { size: 12, bold: true, color: COLOR.navy });
  const half = d.foodRate / 2;
  const end = serviceTable(doc, {
    top: 378.6 + dy,
    lines: d.lines,
    netLabel: 'Net value',
    cgstLabel: `CGST (${half}%)`,
    sgstLabel: ['SGST', `(${half}%)`],
  });
  const afterTotals = totalsBlock(doc, {
    y: end + 17, totals: d.restaurantTotals, cgstTitle: 'CGST', sgstTitle: 'SGST',
  });

  text(doc, `Amount in words: ${amountInWords(d.restaurantTotals.total)}`, 37.4, afterTotals + 38, {
    size: 10.5, bold: true, color: COLOR.navy, maxW: 520,
  });
  text(doc, `Amount of INR ${money(d.restaurantTotals.total)} settled against order id ${d.orderRef} dated on ${d.invoiceDate}`, 37.4, afterTotals + 72, {
    size: 10.5, bold: true, color: COLOR.navy, maxW: 520,
  });
  footer(doc, FOOTER_LABEL);
}

function drawPlatformInvoice(doc, d) {
  const shift = 67.4;
  invoiceHeader(doc, d, { shift, title: 'Tax Invoice', invoiceNumber: d.platformInvoiceNumber });

  const top = 292.7;
  const leftEnd = column(doc, [
    ['Address', '19-4-3/E3/1, 4th floor, Stv Nagar, Tirupati-517501'],
    ['State', d.company.state],
    ['GST :', d.company.gstin],
    ['PAN', d.company.pan],
    ['EMAIL ID :', 'order@reditoe.com'],
  ], { x: 37.4, valueX: 92, valueW: 206, startY: top + 19.6 });
  const rightEnd = column(doc, [
    ['Name', d.customer.name],
    ['Address', d.customer.address],
    ['GST :', 'UNREGISTERED'],
    ['PLACE OF SUPPLY :', d.customer.state],
  ], { x: 311.4, valueX: 392, valueW: 182, startY: top + 28.8 });
  const bottom = Math.max(392.8, leftEnd + 3, rightEnd + 3);
  partiesBox(doc, { y: top, h: bottom - top, left: { title: 'Reditoe India LLP' }, right: { title: 'Billed To (Customer)' } });
  const dy = bottom - 392.8;

  text(doc, 'Service Detail', 37.4, 416.9 + dy, { size: 12, bold: true, color: COLOR.navy });
  const half = d.platformRate / 2;
  const end = serviceTable(doc, {
    top: 443.3 + dy,
    lines: [d.platformLine],
    netLabel: 'Net value',
    cgstLabel: `CGST (${half}%)`,
    sgstLabel: ['SGST', `(${half}%)`],
    rowsMin: 2,
  });
  const afterTotals = totalsBlock(doc, {
    y: end + 25, totals: d.platformTotals, cgstTitle: 'CGST', sgstTitle: 'SGST',
  });

  text(doc, `Amount in words: ${amountInWords(d.platformTotals.total)}`, 37.4, afterTotals + 38, {
    size: 10.5, bold: true, color: COLOR.navy, maxW: 520,
  });
  text(doc, `Amount of INR ${money(d.platformTotals.total)} settled against order id ${d.orderRef} dated on ${d.invoiceDate}`, 37.4, afterTotals + 72, {
    size: 10.5, bold: true, color: COLOR.navy, maxW: 520,
  });
  footer(doc, FOOTER_LABEL);
}

/**
 * `pages` picks which sheets to print. The customer gets all three; the
 * restaurant is only handed its own tax invoice, which carries no phone number.
 */
export function renderCustomerInvoice(data, { pages = ['bill', 'restaurant', 'platform'] } = {}) {
  const doc = createDocument();
  const drawers = { bill: drawBill, restaurant: drawRestaurantInvoice, platform: drawPlatformInvoice };
  pages.forEach((key, index) => {
    if (index > 0) doc.addPage([PAGE.w, PAGE.h]);
    drawers[key](doc, data);
  });
  return finish(doc);
}
