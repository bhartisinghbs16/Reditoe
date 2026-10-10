/**
 * Display formatters. Everything user-facing goes through here so number,
 * date and currency rendering stays consistent across every screen.
 */

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const INR_PRECISE = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("en-IN");

const COMPACT = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function currency(value: number | null | undefined, precise = false) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return precise ? INR_PRECISE.format(value) : INR.format(value);
}

/** ₹8.4L / ₹1.2Cr — for stat tiles where the exact rupee is noise. */
export function currencyCompact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `₹${COMPACT.format(value)}`;
}

export function number(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return NUM.format(value);
}

export function compact(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return COMPACT.format(value);
}

export function percent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

function toDate(value: string | number | Date | null | undefined) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 25 May 2024 */
export function date(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** 25 May 2024, 4:35 PM */
export function dateTime(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  return `${date(d)}, ${time(d)}`;
}

/** 4:35 PM */
export function time(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";
  return d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** "5 mins ago", "2 days ago" — falls back to an absolute date past 30 days. */
export function relativeTime(value: string | number | Date | null | undefined) {
  const d = toDate(value);
  if (!d) return "—";

  const diffMs = Date.now() - d.getTime();
  const future = diffMs < 0;
  const secs = Math.abs(diffMs) / 1000;

  if (secs < 45) return future ? "in a moment" : "just now";

  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [2592000, "day"],
  ];

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  let previous = 1;
  for (const [limit, unit] of units) {
    if (secs < limit) {
      const amount = Math.round(secs / previous);
      return rtf.format(future ? amount : -amount, unit);
    }
    previous = limit;
  }
  return date(d);
}

/** Compresses a Mongo ObjectId into a short, readable reference. */
export function shortId(id: string | null | undefined, prefix = "#") {
  if (!id) return "—";
  return `${prefix}${id.slice(-8).toUpperCase()}`;
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

/** Turns `on_the_way` / `onTheWay` into `On The Way`. */
export function titleCase(value: string | null | undefined) {
  if (!value) return "—";
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

export function phone(value: string | null | undefined) {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  if (digits.length === 12 && digits.startsWith("91"))
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  return value;
}

/** Signed delta for trend chips: +18.6% / −8.4% */
export function delta(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}
