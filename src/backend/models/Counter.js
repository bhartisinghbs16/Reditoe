import mongoose from 'mongoose';

/**
 * Counter for sequential IDs (e.g. order numbers).
 *
 * Order numbers read RI-YYMM-DDXXXX: a constant RI, the year and month, then
 * the day followed by that day's sequence. The counter is therefore kept per
 * day rather than once for all time, and the first order of each day is 0001.
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model('Counter', counterSchema);

/**
 * The calendar day in the timezone the business actually operates in.
 *
 * The server runs on UTC, so taking the date from it would roll the day over
 * at 05:30 local time — every order between midnight and half five in the
 * morning, which for a food delivery service is a real part of the night,
 * would carry the previous day's date and continue the previous day's
 * sequence.
 */
const BUSINESS_TIMEZONE = 'Asia/Kolkata';

function businessDateParts(when = new Date()) {
  // en-CA gives YYYY-MM-DD, which needs no parsing back out of prose.
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(when)
    .split('-');
  return { yy: year.slice(-2), mm: month, dd: day };
}

/**
 * The next order number, as RI-YYMM-DDXXXX.
 *
 * XXXX counts that day's orders from 0001. Numbers already issued in the old
 * AAA-111 style are left alone — they are printed on bills and quoted in
 * support conversations, and renumbering them would break every reference to
 * an order anyone already has.
 */
export async function getNextOrderNumber(when = new Date()) {
  const { yy, mm, dd } = businessDateParts(when);

  // One counter per day, so the sequence restarts rather than running on.
  const result = await Counter.findOneAndUpdate(
    { _id: `orderNumber:${yy}${mm}${dd}` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  // Past 9999 in one day the number simply grows a digit; a wrong number
  // would be worse than a long one.
  const daily = String(result.seq).padStart(4, '0');
  return `RI-${yy}${mm}-${dd}${daily}`;
}

export default Counter;
