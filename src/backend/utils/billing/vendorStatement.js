/**
 * Vendor (restaurant) earnings & payout statement.
 *
 *   page 1   the statement: who, what the period came to, how it splits by payment mode, the bank
 *   page 2   the tax invoice for the fees Reditoe charged the restaurant (commission, convenience fee)
 *   page 3+  one line per day
 *   page n+  one line per order
 *
 * Laid out from the vendor template (Letter, 612 x 792). Every coordinate is a
 * point from the top-left corner, read off that file, so a number here can be
 * checked straight against it. The template was drawn in Word with a narrower
 * face than Noto Sans, so long values shrink to fit their cell rather than spill.
 */
import {
  COLOR, PAGE, createDocument, finish, text as drawText, rect, wrap as wrapText, amountInWords, money,
  round2, formatDate, companyIdentity, logoBase64, FONT,
} from './pdfBase.js';
import { settleOrder } from '../../services/vendorChargesService.js';

const DAY_ROWS_PER_PAGE = 19;
const ORDER_ROWS_PER_PAGE = 20;
const CANCELLATION_PENALTY_RATE = 0.1;

const STATUS_FILL = { Success: '#c8ecc8', Cancelled: '#f6c1c1', Refund: '#fff0a0' };

const rupee = (v) => `₹ ${money(v)}`;

const maskAccount = (value) => {
  const digits = String(value || '').replace(/\s+/g, '');
  return digits ? `XXXX XXXX ${digits.slice(-4)}` : '';
};

const istDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const stamp = (d) => istDay(d).replace(/-/g, '');
const shortDate = (d) => {
  const [y, m, day] = istDay(d).split('-');
  return `${day}/${m}/${y.slice(2)}`;
};

const PAYMENT_ROWS = ['UPI', 'Credit/Debit', 'COD', 'Wallet'];

/** Which of the four rows in the template an order's payment lands in. */
const paymentRow = (order, method) => {
  if (order.paymentMethod === 'cod') return 'COD';
  if (order.paymentMethod === 'wallet' || method === 'wallet') return 'Wallet';
  if (method === 'upi') return 'UPI';
  // Card, net banking and a gateway that did not say which all print as one online row.
  return 'Credit/Debit';
};

/**
 * Folds a period's orders into the statement. Plain data in, plain data out,
 * so the arithmetic can be checked without a database.
 *
 *   orders    Delivered and Cancelled orders the restaurant took in the period
 *   refunds   approved refunds against those orders ({ orderId, refundAmount })
 *   methods   { [orderId]: 'upi' | 'card' | ... } from the payment log
 */
export function buildVendorStatementData({
  restaurant, owner = {}, bank = {}, accountType = '', identity = {}, period, orders,
  refunds = [], methods = {}, platform = {}, now = new Date(),
}) {
  const refundByOrder = new Map();
  refunds.forEach((r) => {
    const key = String(r.orderId);
    refundByOrder.set(key, round2((refundByOrder.get(key) || 0) + (Number(r.refundAmount) || 0)));
  });

  const sorted = [...orders].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const rows = sorted.map((order) => {
    const delivered = order.status === 'Delivered';
    const discountBorneByVendor = order.discountFundedBy === 'vendor' ? order.discount || 0 : 0;
    const s = settleOrder({ restaurant, order, discountBorneByVendor, platform });
    const d = s.deductions;

    const item = delivered ? s.foodTotal : 0;
    const packing = delivered ? round2(-d.packing) : 0;
    const discount = delivered ? d.vendorFundedDiscount : 0;
    const gst = delivered ? round2(d.gst + d.packingGst) : 0;
    const refundRaw = delivered ? refundByOrder.get(String(order._id)) || 0 : 0;
    // A refund can only come out of what the vendor sold on that order.
    const refund = round2(Math.min(refundRaw, item + packing));
    const penalty = delivered ? 0 : Math.round(s.foodTotal * CANCELLATION_PENALTY_RATE);

    return {
      id: String(order._id),
      createdAt: order.createdAt,
      orderNumber: order.orderNumber || String(order._id).slice(-8).toUpperCase(),
      delivered,
      cancelled: !delivered,
      refunded: refund > 0,
      status: !delivered ? 'Cancelled' : refund > 0 ? 'Refund' : 'Success',
      payment: paymentRow(order, methods[String(order._id)]),
      // What the customer's bill held for this order, as the template's columns read it.
      shownItem: s.foodTotal,
      shownPacking: round2(-d.packing),
      shownDiscount: d.vendorFundedDiscount,
      shownGst: round2(d.gst + d.packingGst),
      item,
      packing,
      discount,
      gst,
      refund,
      penalty,
      commission: delivered ? d.commission : 0,
      commissionGst: delivered ? d.commissionGst : 0,
      convenience: delivered ? d.convenience : 0,
      convenienceGst: delivered ? d.convenienceGst : 0,
      gstRate: s.terms.gst.percentage,
      commissionGstRate: s.terms.commission.gstPercentage,
      convenienceGstRate: s.terms.convenience.gstPercentage,
    };
  });

  const sum = (key, list = rows) => round2(list.reduce((acc, r) => acc + r[key], 0));
  const A = sum('item');
  const B = sum('packing');
  const C = sum('gst');
  const D = sum('discount');
  const E = sum('commission');
  const F = sum('commissionGst');
  const G = sum('convenience');
  const H = sum('convenienceGst');
  const I = sum('refund');
  const J = sum('penalty');
  const net = round2(A + B - C - D - E - F - G - H - I - J);

  const sample = rows[0] || {};
  const partnerId = restaurant.outletId || String(restaurant._id).slice(-8).toUpperCase();
  const company = companyIdentity();
  const a = restaurant.address || {};

  // Orders per payment mode - the template counts and totals what was sold, not what was refunded.
  const delivered = rows.filter((r) => r.delivered);
  const byMode = PAYMENT_ROWS.map((label) => {
    const list = delivered.filter((r) => r.payment === label);
    return { label, orders: list.length, amount: round2(list.reduce((acc, r) => acc + r.item + r.packing, 0)) };
  });
  const modeTotal = byMode.reduce((acc, m) => acc + m.amount, 0);
  byMode.forEach((m) => { m.percentage = modeTotal ? round2((m.amount / modeTotal) * 100) : 0; });

  // Day by day, in date order.
  const days = new Map();
  rows.forEach((r) => {
    const key = istDay(r.createdAt);
    if (!days.has(key)) {
      days.set(key, {
        date: shortDate(r.createdAt), total: 0, completed: 0, cancelled: 0, refunded: 0,
        item: 0, packing: 0, discount: 0, refund: 0, gst: 0,
      });
    }
    const day = days.get(key);
    day.total += 1;
    if (r.delivered) day.completed += 1;
    if (r.cancelled) day.cancelled += 1;
    if (r.refunded) day.refunded += 1;
    day.item += r.item;
    day.packing += r.packing;
    day.discount += r.discount;
    day.refund += r.refund;
    day.gst += r.gst;
  });
  const dayRows = [...days.values()].map((day, i) => ({
    index: i + 1,
    ...day,
    item: round2(day.item),
    packing: round2(day.packing),
    discount: round2(day.discount),
    refund: round2(day.refund),
    gst: round2(day.gst),
    gross: round2(day.item + day.packing - day.discount - day.refund),
  }));
  const dayTotals = {
    total: rows.length,
    completed: delivered.length,
    cancelled: rows.filter((r) => r.cancelled).length,
    refunded: rows.filter((r) => r.refunded).length,
    item: A, packing: B, discount: D, refund: I, gst: C,
    gross: round2(A + B - D - I),
  };

  const orderRows = rows.map((r, i) => ({
    index: i + 1,
    date: shortDate(r.createdAt),
    orderNumber: r.orderNumber,
    item: r.shownItem,
    packing: r.shownPacking,
    discount: r.shownDiscount,
    gst: r.shownGst,
    total: round2(r.shownItem + r.shownPacking - r.shownDiscount),
    status: r.status,
  }));

  // The tax invoice: the fees Reditoe charged, each with its GST split down the middle.
  const split = (gst) => {
    const half = round2(gst / 2);
    return { sgst: half, cgst: round2(gst - half) };
  };
  const invoiceLines = [
    { description: 'Platform fee', gross: E, gst: F, rate: sample.commissionGstRate ?? 18 },
    { description: 'Convenience fee', gross: G, gst: H, rate: sample.convenienceGstRate ?? 18 },
  ].filter((l) => l.gross > 0 || l.gst > 0).map((l, i) => ({
    index: i + 1, ...l, ...split(l.gst), net: round2(l.gross + l.gst),
  }));
  if (!invoiceLines.length) {
    invoiceLines.push({
      index: 1, description: 'Platform fee', gross: 0, gst: 0, rate: sample.commissionGstRate ?? 18,
      sgst: 0, cgst: 0, net: 0,
    });
  }
  const rates = [...new Set(invoiceLines.map((l) => l.rate))];
  const invoiceTotals = {
    gross: round2(invoiceLines.reduce((acc, l) => acc + l.gross, 0)),
    sgst: round2(invoiceLines.reduce((acc, l) => acc + l.sgst, 0)),
    cgst: round2(invoiceLines.reduce((acc, l) => acc + l.cgst, 0)),
    net: round2(invoiceLines.reduce((acc, l) => acc + l.net, 0)),
  };

  const periodLabel = `${formatDate(period.from)} to ${formatDate(period.to)}`;
  // 'REST-8F3A21' reads as 'VPS-REST-8F3A21-...' - the prefix adds length, not information.
  const short = String(partnerId).replace(/^REST-/i, '');
  const base = `${short}-${stamp(period.from).slice(2)}-${stamp(period.to).slice(2)}`;

  return {
    company,
    vendor: {
      name: restaurant.name || '',
      partnerId,
      vehicle: '—',
      city: a.city || '',
      gstin: identity.gstin || restaurant.gstInfo?.gstNumber || '',
      address: [a.street, a.city, a.state, a.zipCode].filter(Boolean).join(', '),
    },
    bill: {
      number: `VPS-${base}`,
      date: formatDate(now),
      period: periodLabel,
    },
    invoice: {
      number: `VTI-${base}`,
      date: formatDate(now),
      period: periodLabel,
      terms: 'Adjusted against payout',
    },
    periodRange: `${formatDate(period.from)} – ${formatDate(period.to)}`,
    counts: {
      total: rows.length,
      completed: delivered.length,
      cancelled: dayTotals.cancelled,
      refunded: dayTotals.refunded,
    },
    modes: byMode,
    bank: {
      name: bank.accountHolderName || '',
      bank: bank.bankName || '',
      account: maskAccount(bank.accountNumber),
      ifsc: bank.ifsc || bank.ifscCode || '',
      type: accountType ? accountType[0].toUpperCase() + accountType.slice(1) : '',
    },
    summary: {
      A, B, C, D, E, F, G, H, I, J, net,
      gstRate: rows.find((r) => r.delivered)?.gstRate ?? 5,
      commissionGstRate: sample.commissionGstRate ?? 18,
    },
    inWords: net < 0 ? `Minus ${amountInWords(net)}` : amountInWords(net),
    days: dayRows,
    dayTotals,
    orders: orderRows,
    invoiceLines,
    invoiceTotals,
    invoiceRate: rates.length === 1 ? rates[0] : null,
    invoiceInWords: amountInWords(invoiceTotals.net),
  };
}

/* ── Drawing ────────────────────────────────────────────────────────────── */

const SLATE = COLOR.slate;

/**
 * The template's face is narrower than Noto Sans: at the same point size a
 * label runs about a tenth wider and walks into the column beside it. Every
 * size below is the template's own, scaled once here so widths match it.
 */
const FIT = 0.9;
// Measured against the template: Noto's middle line sits 0.29pt above Word's, so text is nudged down to match.
const NUDGE = 0.29;
const text = (doc, value, x, y, o = {}) => drawText(doc, value, x, y + NUDGE, { ...o, size: (o.size ?? 7.5) * FIT });
const wrap = (doc, value, width, o = {}) => wrapText(doc, value, width, { ...o, size: (o.size ?? 7.5) * FIT });
const measure = (doc, value, size, bold) => {
  doc.setFont(FONT, bold ? 'bold' : 'normal');
  doc.setFontSize(size * FIT);
  return doc.getTextWidth(value);
};

/** A title with the rule Word draws under underlined text. */
function titled(doc, label, cx, y, { size, bold = true, color = SLATE, rule = 0.4, drop = 5.4, maxW = null }) {
  text(doc, label, cx, y, { size, bold, color, align: 'center', maxW });
  const natural = measure(doc, label, size, bold);
  const width = maxW ? Math.min(natural, maxW) : natural;
  rect(doc, cx - width / 2, y + drop, width, rule, { fill: SLATE });
}

const boxTitle = (doc, label, cx, y) => titled(doc, label, cx, y, { size: 7.5, rule: 0.25, drop: 2.8 });

const logo = (doc) => doc.addImage(logoBase64(), 'PNG', 46.68, 19.92, 149.4, 51.6);

const footer = (doc) => text(doc, 'Thank you for being a valued Partner', 272.65, 753.5, { size: 7.5, align: 'center' });

const signature = (doc, forY, signY) => {
  text(doc, 'For Reditoe India LLP', 445.7, forY, { size: 7.5, bold: true });
  text(doc, 'Authorized Signature', 444.1, signY, { size: 7.5, bold: true });
};

/** "Label   :   value" in the template's three columns. */
const field = (doc, label, value, { x, colon, valueX, y, size = 7.5, color = SLATE, maxW = null, bold = true }) => {
  text(doc, label, x, y, { size, bold: true, color });
  text(doc, ':', colon, y, { size, bold: true, color });
  text(doc, value, valueX, y, { size, bold, color: color === SLATE ? SLATE : color, maxW });
};

/** The company box: it is the same block on page 1 and page 2, nudged a few points. */
function companyBox(doc, d, o) {
  rect(doc, o.x, o.y, o.w, o.h, { fill: COLOR.white, stroke: COLOR.black });
  text(doc, 'REDITOE INDIA LLP', o.titleX, o.titleY, { size: 15, bold: true, color: COLOR.red, align: 'center' });
  const tx = o.textX;
  const black = { size: 8.4, bold: true, color: COLOR.black };
  if (o.hashAddress) {
    text(doc, '#19-4-3/E3/1, 4', tx, o.addrY, { ...black });
    const lead = measure(doc, '#19-4-3/E3/1, 4', 8.4, true);
    text(doc, 'th', tx + lead, o.addrY - 1.7, { size: 5.2, bold: true, color: COLOR.black });
    text(doc, ' floor, Stv Nagar, Tirupati-517501', tx + lead + 5, o.addrY, { ...black, maxW: o.x + o.w - (tx + lead + 5) - 4 });
  } else {
    text(doc, 'Address', tx, o.addrY, { size: 7.5, color: SLATE });
    text(doc, ':', o.colon, o.addrY, { size: 7.5, bold: true, color: COLOR.black });
    text(doc, '19-4-3/E3/1, 4th floor, Stv Nagar, Tirupati-517501', o.valueX, o.addrY, {
      size: 7.5, bold: true, color: COLOR.black, maxW: o.x + o.w - o.valueX - 4,
    });
  }
  [
    ['GST', d.company.gstin],
    ['PAN', d.company.pan],
    ['Email', 'vendor@reditoe.com'],
    ['Website', 'www.reditoe.com'],
  ].forEach(([label, value], i) => {
    const y = o.rowsY + i * o.rowPitch;
    text(doc, label, tx + (label === 'PAN' ? 1.6 : 0), y, black);
    text(doc, ':', o.colon, y, black);
    text(doc, value, o.valueX, y, { ...black, maxW: o.x + o.w - o.valueX - 4 });
  });
}

function vendorBox(doc, d, o) {
  rect(doc, o.x, o.y, o.w, o.h, { fill: COLOR.white, stroke: COLOR.black });
  boxTitle(doc, 'Vendor Details', o.titleX, o.titleY);
  const v = d.vendor;
  const rows = [
    ['Name', v.name], ['Partner ID', v.partnerId], ['VEHICLE TYPE', v.vehicle],
    ['CITY', v.city], ['GSTIN (If Registered )', v.gstin],
  ];
  const right = o.x + o.w - 5;
  rows.forEach(([label, value], i) => field(doc, label, value, {
    x: o.labelX, colon: o.colon, valueX: o.valueX, y: o.rowsY + i * o.pitch, maxW: right - o.valueX,
  }));
  const ay = o.rowsY + 5 * o.pitch;
  text(doc, 'ADDRESS', o.labelX, ay, { size: 7.5, bold: true });
  text(doc, ':', o.colon, ay, { size: 7.5, bold: true });
  wrap(doc, v.address, right - o.valueX, { size: 7.5, bold: true }).slice(0, 2)
    .forEach((line, i) => text(doc, line, o.valueX, ay + i * 9.4, { size: 7.5, bold: true }));
}

function drawStatementPage(doc, d) {
  logo(doc);

  // Bill details.
  rect(doc, 333.2, 12.7, 240.7, 65.2, { fill: COLOR.white, stroke: COLOR.black });
  boxTitle(doc, 'Bill Details', 423.0, 20.9);
  [
    ['Statement No', d.bill.number],
    ['S. Generated Date', d.bill.date],
    ['Statement Period', d.bill.period],
  ].forEach(([label, value], i) => field(doc, label, value, {
    x: 340.2, colon: 422.7, valueX: 431, y: 41 + i * 10.55, maxW: 138,
  }));

  titled(doc, 'Vendor Partner Earnings & Payout Statement', 329.35, 112.25, { size: 14.1, maxW: 380 });

  companyBox(doc, d, {
    x: 64.2, y: 133.8, w: 225, h: 96.6, titleX: 176.5, titleY: 146.5, textX: 71.2, hashAddress: true,
    addrY: 173.05, rowsY: 184.95, rowPitch: 11.9, colon: 111.5, valueX: 117.5,
  });
  vendorBox(doc, d, {
    x: 303.8, y: 132.8, w: 245.9, h: 97.9, titleX: 371.25, titleY: 141.2,
    labelX: 310.8, colon: 385.5, valueX: 392, rowsY: 161.2, pitch: 10.5,
  });

  // The six order boxes. The template draws them by hand, so their edges are not quite square;
  // they are kept as drawn.
  rect(doc, 62.2, 260.9, 490, 52.6, { fill: COLOR.white, stroke: COLOR.black });
  const boxes = [
    [61.0, 260.9, 83.8, 52.6, 'Total Orders', 67.9, 269.1, d.counts.total],
    [145.8, 260.4, 83.9, 50.9, 'Completed Orders', 152.8, 268.7, d.counts.completed],
    [230.3, 261.2, 83.9, 52.6, 'Cancelled orders', 237.2, 269.6, d.counts.cancelled],
    [315.2, 261.7, 83.8, 52.1, 'Refunded orders', 322.2, 270.0, d.counts.refunded],
    [400.1, 261.2, 83.9, 50.0],
    [479.2, 261.2, 73.0, 49.2],
  ];
  boxes.forEach(([x, y, w, h, label, lx, ly, value]) => {
    rect(doc, x, y, w, h, { fill: COLOR.white, stroke: COLOR.black });
    if (!label) return;
    text(doc, label, lx, ly, { size: 7.5, color: SLATE });
    text(doc, String(value), lx, y + h - 15, { size: 14.1, bold: true, color: SLATE });
  });

  // Payment mode wise orders.
  rect(doc, 62.2, 321.7, 247.8, 100.8, { fill: COLOR.white, stroke: COLOR.black });
  rect(doc, 62.5, 323.8, 247.8, 37.7, { fill: COLOR.white, stroke: COLOR.black });
  rect(doc, 62.2, 322.6, 247.4, 15.5, { fill: COLOR.white, stroke: COLOR.black });
  text(doc, 'Payment Mode Wise Orders', 155.35, 330.8, { size: 7.5, align: 'center' });
  [['Payment Mode', 69.5], ['Orders', 121.8], ['Amount', 183.4], ['percentage', 242.4]]
    .forEach(([label, x]) => text(doc, label, x, 350.15, { size: 4.7 }));
  d.modes.forEach((m, i) => {
    const y = 381.6 + i * 10.52;
    text(doc, m.label, 69.1, y, { size: 7.5 });
    text(doc, String(m.orders), 121.8, y, { size: 7.5 });
    text(doc, money(m.amount), 183.4, y, { size: 7.5, maxW: 54 });
    text(doc, `${m.percentage.toFixed(2)}%`, 242.4, y, { size: 7.5, maxW: 62 });
  });

  // Bank.
  rect(doc, 323.6, 322.1, 224.2, 94.2, { fill: COLOR.white, stroke: COLOR.black });
  text(doc, 'Vendor Bank Details', 414.2, 330.4, { size: 7.5, align: 'center' });
  [
    ['Account Name', d.bank.name], ['Bank name', d.bank.bank], ['Account NUMBER', d.bank.account],
    ['IFSC CODE', d.bank.ifsc], ['ACCOUNT TYPE', d.bank.type],
  ].forEach(([label, value], i) => {
    const y = 350.3 + i * 10.58;
    text(doc, label, 330.5, y, { size: 7.5 });
    text(doc, ':', 393, y, { size: 7.5 });
    text(doc, value, 399, y, { size: 7.5, bold: true, maxW: 143 });
  });

  // Payout summary.
  titled(doc, 'Vendor Payout Summary:', 300.05, 433.4, { size: 14.1 });
  rect(doc, 62.5, 456.4, 449.4, 183.4, { fill: COLOR.white, stroke: COLOR.black });
  text(doc, 'Description', 71.0, 464.7, { size: 7.5 });
  text(doc, 'Amount', 186.7, 464.7, { size: 7.5 });
  const s = d.summary;
  [
    ['Item Total', '(A)', s.A],
    ['Packing charges', '(B)', s.B],
    [`Gst Collected(${s.gstRate}%)`, '(C)', s.C],
    ['Discount by restaurant', '(D)', s.D],
    ['Platform fee', '(E)', s.E],
    ['Gst on Platform fee', `(F) ${s.commissionGstRate}%`, s.F],
    ['Convenience fee', '(G)', s.G],
    ['Gst on convenience fee', '(H)', s.H],
    ['Refunds', '(I)', s.I],
    ['Cancelled order amounts', '(J)', s.J],
  ].forEach(([label, code, value], i) => {
    const y = 484.6 + i * 10.55;
    text(doc, label, 69.5, y, { size: 7.5 });
    text(doc, code, 157, y, { size: 7.5 });
    text(doc, rupee(value), 205.6, y, { size: 7.5, maxW: 120 });
  });
  text(doc, 'Net payable', 69.5, 611.3, { size: 7.5 });
  text(doc, rupee(s.net), 205.6, 611.3, { size: 7.5, maxW: 160 });
  text(doc, '(A+B -C-D-E-F-G-H-I-J)', 69.5, 621.9, { size: 7.5 });

  // In words.
  const words = `In word : ${d.inWords}`;
  text(doc, words, 46.9, 653.7, { size: 7.5, bold: true, maxW: 500 });
  rect(doc, 46.9, 656.5, Math.min(measure(doc, words, 7.5, true), 500), 0.2, { fill: SLATE });

  signature(doc, 673.6, 733.5);
  footer(doc);
}

function drawInvoicePage(doc, d) {
  logo(doc);

  rect(doc, 393.8, 19.8, 173.8, 81.1, { fill: COLOR.white, stroke: COLOR.black });
  [
    ['Invoice Number', d.invoice.number], ['Invoice date', d.invoice.date],
    ['Invoice period', d.invoice.period], ['Payment terms', d.invoice.terms],
  ].forEach(([label, value], i) => {
    const y = 28.1 + i * 19.97;
    text(doc, label, 400.8, y, { size: 7.5, bold: true, color: COLOR.black });
    text(doc, ':', 456, y, { size: 7.5, bold: true, color: COLOR.black });
    text(doc, value, 462, y, { size: 7.5, bold: true, color: COLOR.black, maxW: 100 });
  });

  titled(doc, 'TAX INVOICE', 288.7, 121.5, { size: 14.1 });

  companyBox(doc, d, {
    x: 69.4, y: 142.3, w: 225, h: 96.7, titleX: 181.6, titleY: 155.2, textX: 76.2,
    addrY: 181.1, rowsY: 192.25, rowPitch: 11.9, colon: 116.3, valueX: 120.2,
  });
  vendorBox(doc, d, {
    x: 308.9, y: 141.5, w: 245.9, h: 97.9, titleX: 376.5, titleY: 149.8,
    labelX: 315.8, colon: 390.5, valueX: 397, rowsY: 169.7, pitch: 10.5,
  });

  // Fee lines.
  const cols = [74.64, 149.46, 241.62, 322.74, 406.2, 493.08, 553.2];
  const top = 288.24;
  const rowH = 20.4;
  const half = d.invoiceRate === null ? '' : `(${d.invoiceRate / 2}%)`;
  const heads = ['Sl.No', 'Description', 'Gross amount', `Sgst${half}`, `CGST${half}`, 'Net Amount'];
  const lines = d.invoiceLines;
  const bottom = top + rowH * (lines.length + 1);
  for (let r = 0; r <= lines.length + 1; r += 1) hRule(doc, cols[0], cols[6], top + r * rowH);
  cols.forEach((x) => vRule(doc, x, top, bottom));
  heads.forEach((label, i) => text(doc, label, cols[i] + 5.1, top + 4.9, { size: 7.5, bold: true, maxW: cols[i + 1] - cols[i] - 6 }));
  lines.forEach((l, r) => {
    const y = top + (r + 1) * rowH + 4.9;
    [l.index, l.description, money(l.gross), money(l.sgst), money(l.cgst), money(l.net)].forEach((value, i) => {
      text(doc, String(value), (cols[i] + cols[i + 1]) / 2, y, {
        size: 7.5, bold: true, align: 'center', maxW: cols[i + 1] - cols[i] - 6,
      });
    });
  });

  // Totals.
  const t = d.invoiceTotals;
  [
    ['Total amount', t.gross, 374.2], ['Cgst', t.cgst, 394.1], ['Sgst', t.sgst, 414.0], ['Total', t.net, 434.1],
  ].forEach(([label, value, y]) => {
    text(doc, label, 446.5, y, { size: 7.5 });
    text(doc, money(value), 547.2, y, { size: 7.5, align: 'right' });
  });

  const words = `Amount in words: ${d.invoiceInWords}`;
  text(doc, words, 69.7, 516.4, { size: 14.1, bold: true, maxW: 480 });

  signature(doc, 599.9, 659.8);
  footer(doc);
}

/** Header text for a table: lines at the template's 10.5 pitch, each one underlined as Word does. */
function tableHeads(doc, cols, top, heads, { maxLinesW = 2 } = {}) {
  heads.forEach((lines, i) => {
    const cx = (cols[i] + cols[i + 1]) / 2;
    lines.forEach(([label, dy]) => {
      if (!label) return;
      titled(doc, label, cx, top + 4.9 + dy, {
        size: 7.5, rule: 0.2, drop: 2.8, maxW: cols[i + 1] - cols[i] - maxLinesW,
      });
    });
  });
}

/**
 * Table rules. Word draws them as 0.48pt filled black bars centred on the grid
 * line, not as strokes, so they are drawn the same way here.
 */
const RULE = 0.48;
const hRule = (doc, x1, x2, y) => rect(doc, x1 - RULE / 2, y - RULE / 2, x2 - x1 + RULE, RULE, { fill: COLOR.black });
const vRule = (doc, x, y1, y2) => rect(doc, x - RULE / 2, y1, RULE, y2 - y1, { fill: COLOR.black });

/** A table grid: the header box, then `rows` body cells, every cell outlined. */
function grid(doc, cols, top, headH, rowH, rows) {
  const bottom = top + headH + rows * rowH;
  hRule(doc, cols[0], cols[cols.length - 1], top);
  hRule(doc, cols[0], cols[cols.length - 1], top + headH);
  for (let r = 1; r <= rows; r += 1) hRule(doc, cols[0], cols[cols.length - 1], top + headH + r * rowH);
  cols.forEach((x) => vRule(doc, x, top, bottom));
}

function drawDayPage(doc, d, rows, { last }) {
  titled(doc, 'Day Wise order Summary', 268.9, 28.75, { size: 14.1 });
  const cols = [47.16, 76.08, 111.24, 160.08, 208.56, 253.92, 297.36, 334.68, 373.32, 414.48, 449.64, 477.9, 517.62];
  const top = 49.44;
  const headH = 51;
  const rowH = 29.665;
  const pair = (a, b, c) => [[a, 0], [b, 10.5], ...(c ? [[c, 30.6]] : [])];
  tableHeads(doc, cols, top, [
    [['Sl.No', 0]], [['Date', 0]], pair('Total', 'Orders'), [['Completed', 0]], [['Cancelled', 0]], [['Refunded', 0]],
    pair('Item', 'Amount', '(A)'), pair('Packing', 'Charges', '(B)'), [['Discount', 0]], pair('Refund', 'AMT'),
    pair('GST', `(${d.summary.gstRate}%)`, '(A+B)'), pair('Gross', 'earnings'),
  ]);

  const lines = last ? [...rows, { totals: true }] : rows;
  grid(doc, cols, top, headH, rowH, lines.length);
  lines.forEach((r, i) => {
    const mid = top + headH + i * rowH + rowH / 2;
    const cell = (c, value, o = {}) => text(doc, String(value), (cols[c] + cols[c + 1]) / 2, mid, {
      size: 7.5, color: SLATE, align: 'center', maxW: cols[c + 1] - cols[c] - 3, ...o,
    });
    const v = r.totals ? d.dayTotals : r;
    if (r.totals) cell(1, 'TOTAL', { bold: true }); else { cell(0, r.index); cell(1, r.date); }
    const bold = { bold: !!r.totals };
    [v.total, v.completed, v.cancelled, v.refunded].forEach((n, k) => cell(2 + k, n, bold));
    [v.item, v.packing, v.discount, v.refund, v.gst, v.gross].forEach((n, k) => cell(6 + k, money(n), bold));
  });
  footer(doc);
}

function drawOrderPage(doc, d, rows) {
  titled(doc, `Order wise Transaction History ( ${d.periodRange} )`, 289.45, 28.75, { size: 14.1, maxW: 470 });
  const cols = [47.16, 78.96, 127.44, 191.16, 251.4, 306.48, 352.8, 413.4, 468.48, 553.26];
  const top = 49.44;
  // The template's header was tall only to hold a colour-legend note; the colours speak for themselves.
  const headH = 51;
  const rowH = 29.665;
  tableHeads(doc, cols, top, [
    [['SL.NO', 0]], [['Date', 0]], [['Order id', 0]], [['Item  Amount', 0]],
    [['Packing', 0], ['charges', 10.5]], [['Discounts', 0]],
    [[`GST(${d.summary.gstRate}%)`, 0], ['(Item +', 15.4], ['packing)', 25.9]], [['Total', 0], ['Amount', 10.5]], [['Status', 0]],
  ]);

  grid(doc, cols, top, headH, rowH, rows.length);
  rows.forEach((r, i) => {
    const y = top + headH + i * rowH;
    const mid = y + rowH / 2;
    const cell = (c, value, o = {}) => text(doc, String(value), (cols[c] + cols[c + 1]) / 2, mid, {
      size: 7.5, color: SLATE, align: 'center', maxW: cols[c + 1] - cols[c] - 3, ...o,
    });
    // The status cell carries the colour: green for a sale, red for a cancellation, yellow for a refund.
    rect(doc, cols[8] + RULE / 2, y + RULE / 2, cols[9] - cols[8] - RULE, rowH - RULE, { fill: STATUS_FILL[r.status] });
    cell(0, r.index); cell(1, r.date); cell(2, r.orderNumber);
    [r.item, r.packing, r.discount, r.gst, r.total].forEach((n, k) => cell(3 + k, money(n)));
    cell(8, r.status, { bold: true });
  });
  footer(doc);
}

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export function renderVendorStatement(data) {
  const doc = createDocument();
  drawStatementPage(doc, data);

  doc.addPage([PAGE.w, PAGE.h]);
  drawInvoicePage(doc, data);

  // The totals line needs a row of its own; when the last page is full it moves to a fresh one.
  const dayPages = chunk(data.days, DAY_ROWS_PER_PAGE);
  if (!dayPages.length || dayPages[dayPages.length - 1].length >= DAY_ROWS_PER_PAGE) dayPages.push([]);
  dayPages.forEach((rows, i) => {
    doc.addPage([PAGE.w, PAGE.h]);
    drawDayPage(doc, data, rows, { last: i === dayPages.length - 1 });
  });

  const orderPages = chunk(data.orders, ORDER_ROWS_PER_PAGE);
  if (!orderPages.length) orderPages.push([]);
  orderPages.forEach((rows) => {
    doc.addPage([PAGE.w, PAGE.h]);
    drawOrderPage(doc, data, rows);
  });

  return finish(doc);
}
