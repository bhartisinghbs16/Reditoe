/**
 * Design tokens.
 *
 * NativeWind covers styling in JSX; this file exists for the places that need
 * raw values — navigation options, gradients, icon colours, drawn maps.
 * Keep the two in step: these mirror `tailwind.config.js`.
 *
 * Every value here was sampled from the client's reference screens, so the app
 * reads as a copy of them rather than a variation on the theme.
 */

export const colors = {
  brand: {
    50: "#fff1f2",
    100: "#ffe0e2",
    200: "#ffc7cb",
    300: "#ff9aa2",
    400: "#f8626f",
    500: "#ed3241",
    600: "#e8112d",
    700: "#c20d24",
    900: "#7d0917",
  },
  leaf: {
    50: "#eefaf3",
    100: "#d6f2e2",
    400: "#34c97e",
    500: "#22a45d",
    600: "#0f8a45",
    700: "#0b7038",
    800: "#08602f",
  },
  sun: {
    50: "#fff8e6",
    100: "#fdf0cc",
    300: "#fcd34d",
    400: "#fbbf24",
    500: "#f59e0b",
    600: "#d97706",
    700: "#a75c07",
  },
  plus: {
    50: "#f5f3ff",
    100: "#ede9fe",
    200: "#ddd6fe",
    400: "#a78bfa",
    500: "#8b5cf6",
    600: "#7c3aed",
    700: "#6d28d9",
  },
  sky: {
    50: "#eff5ff",
    100: "#dbe8fe",
    500: "#3b82f6",
    600: "#2563eb",
    700: "#1d4ed8",
  },
  ink: { default: "#1c1c1c", soft: "#4a4a4a", muted: "#6b7280", faint: "#9ca3af" },
  surface: { default: "#ffffff", sunken: "#f7f7f8", warm: "#fff5f5" },
  line: { default: "#ececec", strong: "#dcdcdc" },
  ok: { default: "#0f8a45", soft: "#eefaf3", ink: "#0b7038" },
  warn: { default: "#d97706", soft: "#fff8e6", ink: "#a75c07" },
  bad: { default: "#e8112d", soft: "#fff1f2", ink: "#c20d24" },
  info: { default: "#2563eb", soft: "#eff5ff", ink: "#1d4ed8" },
  veg: "#0f8a45",
  nonveg: "#e8112d",
  amber: "#f59e0b",
} as const;

/**
 * The reference pairs a pale circle with a saturated glyph for every icon
 * tile — quick actions, benefit grids, category rows. One list, cycled.
 */
export const accents = {
  red: { bg: "#fff1f2", fg: "#e8112d" },
  green: { bg: "#eefaf3", fg: "#0f8a45" },
  purple: { bg: "#f5f3ff", fg: "#7c3aed" },
  amber: { bg: "#fff8e6", fg: "#d97706" },
  blue: { bg: "#eff5ff", fg: "#2563eb" },
  orange: { bg: "#fff7ed", fg: "#ea580c" },
  pink: { bg: "#fdf2f8", fg: "#be185d" },
  teal: { bg: "#f0fdfa", fg: "#0f766e" },
} as const;

export type AccentKey = keyof typeof accents;

export const accentList = Object.values(accents);

/** Category tiles cycle these so the home grid reads as a palette. */
export const categoryTints = accentList;

export function categoryTint(index: number) {
  return accentList[index % accentList.length];
}

/** Order status → the colours and wording the customer sees. */
export const orderStatus = {
  Pending: { label: "Placed", tone: "warn" },
  "Waiting for Confirmation": { label: "Awaiting confirmation", tone: "warn" },
  "Order Confirmed": { label: "Confirmed", tone: "info" },
  Processing: { label: "Preparing", tone: "info" },
  Ready: { label: "Ready for pickup", tone: "info" },
  OnWay: { label: "On the way", tone: "brand" },
  Delivered: { label: "Delivered", tone: "ok" },
  Cancelled: { label: "Cancelled", tone: "bad" },
  Refunded: { label: "Refunded", tone: "info" },
} as const;

export type OrderStatusKey = keyof typeof orderStatus;
export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "plus" | "neutral";

export const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: colors.ok.soft, fg: colors.ok.ink },
  warn: { bg: colors.warn.soft, fg: colors.warn.ink },
  bad: { bg: colors.bad.soft, fg: colors.bad.ink },
  info: { bg: colors.info.soft, fg: colors.info.ink },
  brand: { bg: colors.brand[50], fg: colors.brand[700] },
  plus: { bg: colors.plus[100], fg: colors.plus[700] },
  neutral: { bg: "#f2f2f2", fg: colors.ink.soft },
};

export function statusFor(status?: string) {
  const entry = orderStatus[status as OrderStatusKey];
  return entry ?? { label: status ?? "—", tone: "neutral" as const };
}

/** Consistent elevation — two levels only, matching the console. */
export const shadow = {
  card: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
