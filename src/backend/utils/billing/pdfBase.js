/**
 * Drawing helpers shared by the billing PDFs (customer invoice, rider statement).
 *
 * The layouts were drawn in a Letter-sized document and every coordinate in
 * the generators is a point measured from its top-left corner, so a number
 * here can be checked straight against the design.
 *
 * Text is set in Noto Sans, which carries the rupee sign; the built-in PDF
 * fonts do not, and ₹ would print as a stray glyph.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { jsPDF } from 'jspdf';

const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(here, '../../assets');

export const PAGE = { w: 612, h: 792 };

export const COLOR = {
  navy: '#173b56',
  slate: '#2b353f',
  muted: '#647482',
  red: '#d83a4e',
  pink: '#f70a8d',
  black: '#000000',
  white: '#ffffff',
  rule: '#d7e0e7',
  band: '#f2f6f9',
  total: '#e7eef3',
  link: '#0000ff',
};

let cached = null;
const assets = () => {
  if (!cached) {
    const font = (name) => fs.readFileSync(path.join(ASSETS, 'fonts', name)).toString('base64');
    cached = {
      regular: font('NotoSans_400Regular.ttf'),
      bold: font('NotoSans_700Bold.ttf'),
      logo: fs.readFileSync(path.join(ASSETS, 'invoice', 'reditoe-logo.png')).toString('base64'),
    };
  }
  return cached;
};

export const FONT = 'NotoSans';

export const logoBase64 = () => assets().logo;

export function createDocument() {
  const doc = new jsPDF({ unit: 'pt', format: [PAGE.w, PAGE.h], compress: true });
  const { regular, bold } = assets();
  doc.addFileToVFS('NotoSans-Regular.ttf', regular);
  doc.addFont('NotoSans-Regular.ttf', FONT, 'normal');
  doc.addFileToVFS('NotoSans-Bold.ttf', bold);
  doc.addFont('NotoSans-Bold.ttf', FONT, 'bold');
  doc.setLineWidth(0.48);
  return doc;
}

export function finish(doc) {
  return Buffer.from(doc.output('arraybuffer'));
}

/**
 * Text, centred vertically on `y`. With `maxW` the size shrinks until the text
 * fits - Noto runs wider than the face the design was drawn in, and a long
 * restaurant name must not spill out of its cell.
 */
export function text(doc, value, x, y, {
  size = 7.5,
  bold = false,
  color = COLOR.slate,
  align = 'left',
  maxW = null,
} = {}) {
  const str = String(value ?? '');
  if (!str) return;
  doc.setFont(FONT, bold ? 'bold' : 'normal');
  let fontSize = size;
  doc.setFontSize(fontSize);
  if (maxW) {
    const width = doc.getTextWidth(str);
    if (width > maxW) {
      fontSize = Math.max(4.5, (size * maxW) / width);
      doc.setFontSize(fontSize);
    }
  }
  doc.setTextColor(color);
  doc.text(str, x, y, { align, baseline: 'middle' });
}

/** Word-wrapped lines for a given width, at the size and weight the text is set in. */
export function wrap(doc, value, width, { size = 7.5, bold = false } = {}) {
  doc.setFont(FONT, bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  return doc.splitTextToSize(String(value ?? ''), width);
}

export function rect(doc, x, y, w, h, { fill = null, stroke = null } = {}) {
  if (fill) doc.setFillColor(fill);
  if (stroke) doc.setDrawColor(stroke);
  const style = fill && stroke ? 'FD' : fill ? 'F' : 'S';
  doc.rect(x, y, w, h, style);
}

export function line(doc, x1, y1, x2, y2, color = COLOR.black) {
  doc.setDrawColor(color);
  doc.line(x1, y1, x2, y2);
}

/** The letterhead: logo on the left, the company box on the right. */
export function letterhead(doc, {
  top = 0,
  boxX = 381,
  boxW = 220.2,
  boxH = 103.2,
  email = 'order@reditoe.com',
  emailLink = true,
  gstin = '',
  pan = '',
  logoY = 34.3,
  singleLine = false,
}) {
  doc.addImage(assets().logo, 'PNG', 37.2, logoY + top, 158.6, 54.96);

  rect(doc, boxX, 8.8 + top, boxW, boxH, { fill: COLOR.white, stroke: COLOR.black });
  text(doc, 'REDITOE INDIA LLP', boxX + boxW / 2, 22.4 + top, {
    size: 15.9, bold: true, color: COLOR.red, align: 'center', maxW: boxW - 20,
  });

  const x = boxX + 7.4;
  // Map pin.
  doc.setFillColor(COLOR.pink);
  doc.circle(x + 5, 50.8 + top, 3.2, 'F');
  doc.setFillColor(COLOR.white);
  doc.circle(x + 5, 50.2 + top, 1.1, 'F');
  text(doc, '19-4-3/E3/1, 4', x + 12.5, 51.3 + top, { size: 9, bold: true, color: COLOR.black });
  doc.setFont(FONT, 'bold');
  doc.setFontSize(9);
  const lead = doc.getTextWidth('19-4-3/E3/1, 4');
  text(doc, 'th', x + 12.5 + lead, 49.3 + top, { size: 5.5, bold: true, color: COLOR.black });
  text(doc, ' floor, Stv Nagar, Tirupati-517501', x + 12.5 + lead + 7.4, 51.3 + top, {
    size: 9, bold: true, color: COLOR.black, maxW: boxW - 7.4 - 12.5 - lead - 15,
  });

  text(doc, `GSTIN: ${gstin}`, x, 63.6 + top, { size: 9, bold: true, color: COLOR.black });
  text(doc, `Pan : ${pan}`, x, 76.2 + top, { size: 9, bold: true, color: COLOR.black });

  // Envelope.
  const ey = 89.8 + top;
  doc.setDrawColor(COLOR.black);
  doc.rect(x + 0.5, ey - 3.4, 9, 6.6, 'S');
  doc.line(x + 0.5, ey - 3.4, x + 5, ey + 0.4);
  doc.line(x + 9.5, ey - 3.4, x + 5, ey + 0.4);
  const mailColor = emailLink ? COLOR.link : COLOR.black;
  text(doc, email, x + 12.5, ey, { size: 9, color: mailColor });
  if (emailLink) {
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    const w = doc.getTextWidth(email);
    doc.setDrawColor(COLOR.link);
    doc.line(x + 12.5, ey + 5.1, x + 12.5 + w, ey + 5.1);
  }
}

export function footer(doc, label) {
  text(doc, label, PAGE.w / 2, 752, { size: 6.5, color: COLOR.muted, align: 'center' });
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
  'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const below100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`);
const below1000 = (n) => {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [hundreds ? `${ONES[hundreds]} Hundred` : '', rest ? below100(rest) : ''].filter(Boolean).join(' ');
};

/** 220.5 -> "Two Hundred Twenty Rupees and Fifty Paise Only", in the Indian grouping. */
export function amountInWords(amount) {
  const paise = Math.round(Math.abs(Number(amount) || 0) * 100);
  const rupees = Math.floor(paise / 100);
  const rem = paise % 100;

  const groups = [
    [Math.floor(rupees / 10000000), 'Crore'],
    [Math.floor(rupees / 100000) % 100, 'Lakh'],
    [Math.floor(rupees / 1000) % 100, 'Thousand'],
  ];
  const parts = groups.filter(([n]) => n).map(([n, label]) => `${below100(n)} ${label}`);
  const tail = below1000(rupees % 1000);
  if (tail) parts.push(tail);

  const rupeeWords = parts.length ? `${parts.join(' ')} Rupees` : 'Zero Rupees';
  return rem ? `${rupeeWords} and ${below100(rem)} Paise Only` : `${rupeeWords} Only`;
}

export const money = (value) => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const round2 = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export const formatDate = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

export const formatDateTime = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
  });
};

/** The company's own tax registration, set per deployment rather than hard-coded. */
export const companyIdentity = () => ({
  gstin: process.env.REDITOE_GSTIN || '',
  pan: process.env.REDITOE_PAN || '',
  state: process.env.REDITOE_STATE || 'Andhra Pradesh',
});
