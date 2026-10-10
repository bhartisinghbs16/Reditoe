/** Display formatters — the app's single source for money, dates and counts. */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/**
 * The reference sets money to the paisa on every headline figure —
 * "₹18,450.00", "₹2,850.75" — so that spelling gets its own formatter rather
 * than each screen appending ".00".
 */
const INR_EXACT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("en-IN");

export function currency(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return INR.format(value);
}

export function money(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return INR_EXACT.format(value);
}

/** "5 mins ago" — the age a kitchen actually works to. */
export function ago(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Minutes since the order landed, unformatted, for overdue thresholds. */
export function minutesSince(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return 0;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 60_000));
}

export function number(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return NUM.format(value);
}

/** 1.2K+ ratings — counts customers read as "lots", not as an exact figure. */
/** "₹1.2L" / "₹18.4K" — money that has to fit inside a stat tile. */
export function currencyCompact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return INR.format(value);
}

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
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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

export function initials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
