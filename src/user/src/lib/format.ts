/** Display formatters — the app's single source for money, dates and counts. */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const NUM = new Intl.NumberFormat("en-IN");

export function currency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return INR.format(value);
}

const INR_EXACT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Money on a bill: always to the paisa.
 *
 * `currency` rounds to whole rupees, which is right for a menu price and wrong
 * for a bill. The server prices to the paisa and charges exactly that, so a
 * line shown as ₹17 (really 16.84) and a total shown as ₹255 (really 254.84)
 * left a bill whose lines visibly did not add up to its total, and an amount
 * charged that was not the amount shown.
 */
export function currencyExact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return INR_EXACT.format(value);
}

export function number(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return NUM.format(value);
}

/** 1.2K+ ratings — counts customers read as "lots", not as an exact figure. */
export function compactCount(value: number | null | undefined) {
  if (!value) return "0";
  if (value < 1000) return String(value);
  if (value < 100000) return `${(value / 1000).toFixed(value < 10000 ? 1 : 0)}K+`;
  return `${(value / 100000).toFixed(1)}L+`;
}

function toDate(value: string | number | Date | null | undefined) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function time(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  // en-IN renders the meridiem lowercase; the reference screens print "10:23 AM".
  return d
    .toLocaleTimeString("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
}

export function date(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Today, 10:48 AM" / "Yesterday, 9:12 PM" / "16 May, 8:30 AM" */
export function friendlyDateTime(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((startOfToday.getTime() - d.getTime()) / 86_400_000);

  if (d >= startOfToday) return `Today, ${time(d)}`;
  if (days < 1) return `Yesterday, ${time(d)}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${time(d)}`;
}

/** "in 25 mins" for an ETA that hasn't passed, "any moment now" once it has. */
export function etaFromNow(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  const minutes = Math.round((d.getTime() - Date.now()) / 60_000);
  if (minutes <= 0) return "any moment now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ${minutes % 60} mins`;
}

/**
 * A customer's name as it may be put on screen, or "" when what the account
 * carries is not a name.
 *
 * The name comes from the account record, and a record can hold things that
 * are not one - an id, an email address, a token, a number - when the account
 * was created by something other than the sign-up form. Showing that as
 * "Hello, 64f1c9..." exposes an internal detail and tells the customer nothing,
 * so anything that reads as technical is treated as no name at all and the
 * caller falls back to a plain label.
 */
export function humanName(value: string | null | undefined): string {
  const name = (value ?? "").replace(/\s+/g, " ").trim();
  if (!name || name.length > 60) return "";
  // Digits and symbols only: a phone number, a code.
  if (!/[A-Za-zÀ-￿]/.test(name)) return "";
  // An email address, a URL or a path.
  if (/[@/\\]|^www\./i.test(name)) return "";
  // Names do not carry underscores; identifiers like user_8842 do.
  if (name.includes("_")) return "";
  // A database id or a UUID.
  if (/^[0-9a-f]{24}$/i.test(name)) return "";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return "";
  // A bearer token, a JWT or a gateway key.
  if (/^(eyJ|Bearer\s|sk-|sk_|pk_|rk_|rzp_|key_|api[-_ ]?key)/i.test(name)) return "";
  // One long unbroken run with digits in it is a key, not a surname.
  if (!name.includes(" ") && name.length >= 20 && /\d/.test(name)) return "";
  return name;
}

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Types the slashes into a date of birth as the digits go in, so nobody has to.
 *
 * Anything that is not a digit is dropped rather than refused: a paste that
 * carries dashes or spaces still lands as a date instead of failing.
 */
export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * DD/MM/YYYY as the ISO date the server stores, or null when it is not a real
 * date in the past.
 *
 * Checked by building the date and reading it back, so 31/02/2000 is refused
 * rather than quietly rolling over into March.
 */
export function isoFromDDMMYYYY(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (
    date.getFullYear() !== Number(yyyy) ||
    date.getMonth() !== Number(mm) - 1 ||
    date.getDate() !== Number(dd) ||
    Number(yyyy) < 1900 ||
    date.getTime() > Date.now()
  ) {
    return null;
  }
  return `${yyyy}-${mm}-${dd}`;
}
