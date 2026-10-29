/**
 * Delivery partner earnings & payout statement.
 *
 *   page 1   the partner, the billing period, the payout summary and what was paid
 *   page 2+  one line per delivered order
 *
 * Generated when an admin raises a payout for a partner over a billing period.
 */
import {
  COLOR, PAGE, createDocument, finish, text, rect, wrap, amountInWords, money,
  round2, formatDate, companyIdentity, logoBase64,
} from './pdfBase.js';

const GST_RATE = 18;
const TDS_RATE = 1;
const ROWS_PER_PAGE = 19;

const rupee = (v) => `₹ ${money(v)}`;

const maskAccount = (value) => {
  const digits = String(value || '').replace(/\s+/g, '');
  return digits ? `XXXX XXXX ${digits.slice(-4)}` : '';
};

/**
 * Folds a period's records into the statement. All inputs are plain data so
 * the arithmetic can be checked without a database.
 *
 *   earnings     RiderEarning rows, each with `orderNumber` and `tip` resolved
 *   bonus        bonus released to the partner in the period
 *   withdrawals  completed RiderWithdrawal rows paid in the period
 */
export function buildStatementData({
  rider, period, earnings, bonus = 0, withdrawals = [], bank = {}, stats = {},
}) {
  const gstin = rider.gstin || rider.gstNumber || '';
  const rows = earnings
    .filter((e) => e.status !== 'reversed')
    .map((e, i) => {
      const delivery = round2(e.deliveryFee);
      const gst = gstin ? round2((delivery * GST_RATE) / 100) : 0;
      const incentive = round2(e.incentive);
      const tips = round2(e.tip);
      return {
        index: i + 1,
        date: formatDate(e.createdAt),
        orderNumber: e.orderNumber || '',
        delivery,
        gst,
        incentive,
        tips,
        total: round2(delivery + gst + incentive + tips),
        commission: round2(e.commission),
        penalty: round2(e.penalty),
        distance: Number(e.distance) || 0,
      };
    });

  const sum = (key) => round2(rows.reduce((acc, r) => acc + r[key], 0));
  const totalEarning = round2(sum('delivery') + sum('gst'));
  const incentive = sum('incentive');
  const tips = sum('tips');
  const bonusAmount = round2(bonus);
  const platformFee = sum('commission');
  const penalty = sum('penalty');
  // Deducted at source on what the partner is paid, before GST and before our own deductions.
  const tdsBase = round2(sum('delivery') + incentive + tips + bonusAmount);
  const tds = round2((tdsBase * TDS_RATE) / 100);
  const netPayable = round2(totalEarning + incentive + tips + bonusAmount - platformFee - penalty - tds);

  const paid = round2(withdrawals.reduce((acc, w) => acc + (Number(w.amount) || 0), 0));
  const lastPaid = withdrawals[withdrawals.length - 1];
  const settled = paid > 0 && paid + 0.005 >= netPayable;

  const partnerId = rider.riderId || String(rider._id).slice(-8).toUpperCase();
  const stamp = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).replace(/-/g, '');
  const company = companyIdentity();

  return {
    company,
    partner: {
      name: rider.name || '',
      partnerId,
      vehicle: [rider.vehicleType, rider.vehicleNumber].filter(Boolean).join(' · '),
      city: rider.city || rider.address?.city || '',
      gstin,
      address: rider.fullAddress || rider.address?.street || (typeof rider.address === 'string' ? rider.address : ''),
    },
    bill: {
      number: `RDP-${partnerId}-${stamp(period.from)}-${stamp(period.to)}`,
      date: formatDate(period.generatedAt || new Date()),
      period: `${formatDate(period.from)} to ${formatDate(period.to)}`,
    },
    summary: {
      totalEarning, incentive, tips, bonus: bonusAmount, platformFee, penalty, tds, netPayable,
    },
    payout: {
      status: settled ? 'Paid' : 'Pending',
      date: settled && lastPaid ? formatDate(lastPaid.processedAt || lastPaid.updatedAt) : '',
      paid: settled ? paid : 0,
      mode: lastPaid?.autopayReference || lastPaid?.isAutopay ? 'NEFT (auto)' : lastPaid ? 'NEFT' : '',
      utr: settled && lastPaid ? (lastPaid.transactionReference || lastPaid.autopayReference || '') : '',
      account: maskAccount(bank.accountNumber),
    },
    activity: {
      total: stats.total ?? rows.length,
      accepted: stats.accepted ?? rows.length,
      rejected: stats.rejected ?? 0,
      cancelled: stats.cancelled ?? 0,
      escalations: stats.escalations ?? 0,
      distance: round2(sum('distance')),
    },
    rows,
    totals: {
      delivery: sum('delivery'), gst: sum('gst'), incentive, tips, total: sum('total'),
    },
    inWords: amountInWords(netPayable),
  };
}

/* ── Drawing ────────────────────────────────────────────────────────────── */

function banner(doc, d, { boxX, boxY, boxW, boxH, logoX, logoY }) {
  doc.addImage(logoBase64(), 'PNG', logoX, logoY, 149.4, 51.6);
  rect(doc, boxX, boxY, boxW, boxH, { fill: COLOR.white, stroke: COLOR.black });
  const cx = boxX + boxW / 2;
  text(doc, 'REDITOE INDIA LLP', cx, boxY + 9, { size: 15, bold: true, color: COLOR.red, align: 'center' });
  const x = boxX + 7;
  const w = boxW - 14;
  text(doc, '#19-4-3/E3/1, 4th floor, Stv Nagar, Tirupati-517501', x, boxY + 34.7, { size: 8.4, bold: true, color: COLOR.black, maxW: w });
  text(doc, `GST    : ${d.company.gstin}`, x, boxY + 46.4, { size: 8.4, bold: true, color: COLOR.black });
  text(doc, `| PAN        : ${d.company.pan}`, x + 150, boxY + 46.4, { size: 8.4, bold: true, color: COLOR.black });
  text(doc, 'Email:  ridersupport@reditoe.com | website: www.reditoe.com', x, boxY + 58.2, { size: 8.4, bold: true, color: COLOR.black, maxW: w });
}

const heading = (doc, label, cx, y, { align = 'center', ruleFrom = null, ruleTo = null } = {}) => {
  text(doc, label, cx, y, { size: 14.1, bold: true, color: COLOR.slate, align });
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(14.1);
  const width = doc.getTextWidth(label);
  const x0 = ruleFrom ?? (align === 'center' ? cx - width / 2 : cx);
  const x1 = ruleTo ?? x0 + width;
  doc.setDrawColor(COLOR.slate);
  doc.setLineWidth(0.4);
  doc.line(x0, y + 9, x1, y + 9);
  doc.setLineWidth(0.48);
};

const boxTitle = (doc, label, cx, y) => {
  text(doc, label, cx, y, { size: 7.5, bold: true, color: COLOR.slate, align: 'center' });
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(7.5);
  const w = doc.getTextWidth(label);
  doc.setDrawColor(COLOR.slate);
  doc.setLineWidth(0.3);
  doc.line(cx - w / 2, y + 5.3, cx + w / 2, y + 5.3);
  doc.setLineWidth(0.48);
};

const labelled = (doc, label, value, x, valueX, y, { maxW = null, bold = true } = {}) => {
  text(doc, label, x, y, { size: 7.5, bold: true });
  text(doc, ':', valueX - 8, y, { size: 7.5, bold: true });
  text(doc, value, valueX, y, { size: 7.5, bold, maxW });
};

function drawSummaryPage(doc, d) {
  banner(doc, d, { boxX: 333.2, boxY: 12.8, boxW: 240.8, boxH: 78.4, logoX: 46.7, logoY: 19.9 });
  heading(doc, 'Delivery Partner Earnings & Payout Statement', 283.6, 132);

  // Partner details.
  rect(doc, 64.1, 153.7, 225, 112.3, { fill: COLOR.white, stroke: COLOR.black });
  boxTitle(doc, 'Partner Details', 126.5, 162);
  const p = d.partner;
  const left = [
    ['Name', p.name], ['Partner ID', p.partnerId], ['VEHICLE TYPE', p.vehicle],
    ['CITY', p.city], ['GSTIN (If Registered )', p.gstin],
  ];
  left.forEach(([label, value], i) => labelled(doc, label, value, 71, 152, 182 + i * 10.6, { maxW: 132 }));
  text(doc, 'ADDRESS', 71, 234.8, { size: 7.5, bold: true });
  text(doc, ':', 144, 234.8, { size: 7.5, bold: true });
  wrap(doc, p.address, 132, { size: 7.5, bold: true }).slice(0, 3)
    .forEach((l, i) => text(doc, l, 152, 234.8 + i * 9.6, { size: 7.5, bold: true }));

  // Bill details.
  rect(doc, 304, 153, 245.8, 112.3, { fill: COLOR.white, stroke: COLOR.black });
  boxTitle(doc, 'Bill Details', 427.9, 161.3);
  labelled(doc, 'Bill Number', d.bill.number, 311, 402, 181.2, { maxW: 140 });
  labelled(doc, 'Bill Date', d.bill.date, 311, 402, 191.9);
  labelled(doc, 'Billing Period', d.bill.period, 311, 402, 202.4, { maxW: 140 });

  // Payout summary.
  heading(doc, 'Rider Payout Summary:', 46.9, 307, { align: 'left', ruleFrom: 46.9, ruleTo: 205.8 });
  rect(doc, 66.2, 331.6, 415.7, 147.3, { fill: COLOR.white, stroke: COLOR.black });
  text(doc, 'Description', 74.8, 339.8, { size: 7.5 });
  text(doc, 'Amount', 206.5, 339.8, { size: 7.5, align: 'right' });
  const s = d.summary;
  const rows = [
    ['Total earning', rupee(s.totalEarning)],
    ['(+) incentive', rupee(s.incentive)],
    ['(+) tips', rupee(s.tips)],
    ['(+) Bonus / Referrals', rupee(s.bonus)],
    ['(-) platform fee', rupee(s.platformFee)],
    ['(-) penalty', rupee(s.penalty)],
    [`(-) TDS (${TDS_RATE}%)`, rupee(s.tds)],
  ];
  rows.forEach(([label, value], i) => {
    const y = 359.7 + i * 10.55;
    text(doc, label, 73.2, y, { size: 7.5 });
    text(doc, value, 206.5, y, { size: 7.5, align: 'right' });
  });
  text(doc, 'Net payable', 73.2, 454.8, { size: 7.5, bold: true });
  text(doc, rupee(s.netPayable), 206.5, 454.8, { size: 7.5, bold: true, align: 'right' });

  // In words.
  const words = `In word : ${d.inWords}`;
  text(doc, words, 46.9, 511.7, { size: 14.1, bold: true, color: COLOR.slate, maxW: 520 });
  doc.setFont('NotoSans', 'bold');
  doc.setFontSize(14.1);
  const w = Math.min(doc.getTextWidth(words), 520);
  doc.setDrawColor(COLOR.slate);
  doc.setLineWidth(0.4);
  doc.line(46.9, 517.1, 46.9 + w, 517.1);
  doc.setLineWidth(0.48);

  // Payout information.
  rect(doc, 58.8, 549.5, 220.4, 162.8, { fill: COLOR.white, stroke: COLOR.black });
  text(doc, 'Payout Information', 129, 557.7, { size: 7.5, align: 'center' });
  const o = d.payout;
  [
    ['Payment status', o.status],
    ['Payout date', o.date],
    ['Amount paid', o.paid ? rupee(o.paid) : ''],
    ['Payment mode', o.mode],
    ['UTR', o.utr],
    ['BANK ACCOUNT', o.account],
  ].forEach(([label, value], i) => {
    const y = 597.6 + i * 19.98;
    text(doc, `${label} :`, 65.8, y, { size: 7.5 });
    text(doc, value, 65.8 + 72, y, { size: 7.5, bold: true, maxW: 130 });
  });

  // Rider summary.
  rect(doc, 296.5, 545.4, 220.5, 162.8, { fill: COLOR.white, stroke: COLOR.black });
  text(doc, 'Rider Summary', 406.7, 553.6, { size: 7.5, align: 'center' });
  const a = d.activity;
  [
    ['Total order', a.total], ['Accepted orders', a.accepted], ['Rejected orders', a.rejected],
    ['Cancelled orders', a.cancelled], ['Escalations', a.escalations], ['Distance Travelled', `${a.distance} km`],
  ].forEach(([label, value], i) => {
    const y = 573.6 + i * 19.98;
    text(doc, `${label} :`, 303.5, y, { size: 7.5 });
    text(doc, String(value), 303.5 + 76, y, { size: 7.5, bold: true });
  });

  // Thank you.
  rect(doc, 102.7, 746.9, 404.5, 42.2, { fill: COLOR.white, stroke: COLOR.black });
  text(doc, 'Thank you for being a Valued Delivery Partner', 304.8, 759.7, {
    size: 15, color: '#ee0000', align: 'center', maxW: 390,
  });
}

function drawOrderPage(doc, d, rows, { last }) {
  banner(doc, d, { boxX: 326.8, boxY: 19.7, boxW: 240.7, boxH: 78.2, logoX: 46.7, logoY: 19.9 });
  heading(doc, 'Order wise earning REPORT', 283.7, 121.5);

  const cols = [46.9, 82.9, 146.8, 260.0, 313.3, 366.6, 439.8, 486.5, 560.3];
  const top = 142;
  const headH = 31;
  const heads = ['Sl.No', 'Date', 'Order id', ['Delivery', 'charges'], 'GST (18%)', 'INCENTIVES', 'TIPS', 'Total earnings'];
  heads.forEach((label, i) => {
    const a = cols[i];
    const b = cols[i + 1];
    rect(doc, a, top, b - a, headH, { stroke: COLOR.black });
    const parts = Array.isArray(label) ? label : [label];
    parts.forEach((part, k) => {
      const y = top + 9.6 + k * 10.7;
      text(doc, part, (a + b) / 2, y, { size: 7.5, bold: true, color: COLOR.slate, align: 'center', maxW: b - a - 4 });
      if (k === parts.length - 1) {
        doc.setFont('NotoSans', 'bold');
        doc.setFontSize(7.5);
        const w = Math.min(doc.getTextWidth(part), b - a - 4);
        doc.setDrawColor(COLOR.slate);
        doc.setLineWidth(0.3);
        doc.line((a + b) / 2 - w / 2, y + 5.2, (a + b) / 2 + w / 2, y + 5.2);
        doc.setLineWidth(0.48);
      }
    });
  });

  const rowH = 29.7;
  let y = top + headH;
  const lines = last ? [...rows, { totals: true }] : rows;
  lines.forEach((r) => {
    for (let c = 0; c < 8; c += 1) rect(doc, cols[c], y, cols[c + 1] - cols[c], rowH, { stroke: COLOR.black });
    const mid = y + rowH / 2;
    const cell = (c, value, o = {}) => text(doc, value, (cols[c] + cols[c + 1]) / 2, mid, {
      size: 7.5, color: COLOR.slate, align: 'center', maxW: cols[c + 1] - cols[c] - 5, ...o,
    });
    if (r.totals) {
      cell(2, 'TOTAL', { bold: true });
      const t = d.totals;
      [t.delivery, t.gst, t.incentive, t.tips, t.total].forEach((v, k) => cell(3 + k, money(v), { bold: true }));
    } else {
      cell(0, r.index);
      cell(1, r.date);
      cell(2, r.orderNumber);
      [r.delivery, r.gst, r.incentive, r.tips, r.total].forEach((v, k) => cell(3 + k, money(v)));
    }
    y += rowH;
  });
}

export function renderRiderStatement(data) {
  const doc = createDocument();
  drawSummaryPage(doc, data);

  const pages = [];
  for (let i = 0; i < data.rows.length; i += ROWS_PER_PAGE) pages.push(data.rows.slice(i, i + ROWS_PER_PAGE));
  if (!pages.length) pages.push([]);
  // The totals line needs a row of its own; when the last page is full it moves to a fresh one.
  if (pages[pages.length - 1].length >= ROWS_PER_PAGE) pages.push([]);

  pages.forEach((rows, i) => {
    doc.addPage([PAGE.w, PAGE.h]);
    drawOrderPage(doc, data, rows, { last: i === pages.length - 1 });
  });
  return finish(doc);
}

