/**
 * Date-range scoping.
 *
 * The reference puts a date pill in the top right of the dashboard and a
 * period dropdown on every chart. Both are real here: the pill narrows every
 * panel computed from orders, and the dropdown switches which series the API
 * already returns.
 */

export type DateRange = "today" | "7d" | "30d" | "all";

export const DATE_RANGES: Array<{ value: DateRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export function rangeLabel(range: DateRange) {
  return DATE_RANGES.find((entry) => entry.value === range)?.label ?? "All time";
}

/** Start of the window, or null for "all time". */
function startOf(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "today") return midnight;
  const days = range === "7d" ? 7 : 30;
  return new Date(midnight.getTime() - (days - 1) * 86_400_000);
}

export function inRange(iso: string | undefined, range: DateRange) {
  if (range === "all") return true;
  if (!iso) return false;
  const start = startOf(range);
  if (!start) return true;
  const at = new Date(iso).getTime();
  return Number.isFinite(at) && at >= start.getTime();
}

/**
 * The chart series `/vendor/stats` returns. Daily is by weekday, weekly by
 * week and monthly by month — the same three the mobile app plots.
 */
export type Period = "daily" | "weekly" | "monthly";

export const PERIODS: Array<{ value: Period; label: string }> = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

export function periodLabel(period: Period) {
  return PERIODS.find((entry) => entry.value === period)?.label ?? "Daily";
}
