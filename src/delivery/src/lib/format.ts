/** Display formatters — the app's single source for money, dates and counts. */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** The reference prints every rupee figure to two places — ₹1,250.00. */
const INR_PAISE = new Intl.NumberFormat("en-IN", {
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

/** ₹1,250.00 — the form used on every banner, statement and payout row. */
export function money(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}${INR_PAISE.format(Math.abs(value))}`;
}

/** "2 mins ago" — the elapsed line on every order card. */
export function minutesAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? "" : "s"} ago`;
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
  // en-IN gives a lowercase meridiem; the reference sets it in caps — "9:40 AM".
  return d
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s*([ap])\.?m\.?$/i, (_, half: string) => ` ${half.toUpperCase()}M`);
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
