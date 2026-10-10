/**
 * Design tokens.
 *
 * The vendor app reproduces the client's reference screens rather than
 * reinterpreting them: the same red Reditoe chrome on Dashboard / Orders /
 * Menu, and the same indigo chrome on Payments and Settings. Values below were
 * sampled from the reference PNGs, so keep them and `tailwind.config.js` in
 * step — NativeWind styles the JSX, this file serves the places that need raw
 * values (navigation options, gradients, icon colours, chart marks).
 */

export const colors = {
  /** Reditoe red — wordmark, primary CTAs, active tabs on the red screens. */
  brand: {
    50: "#fff1f1",
    100: "#ffe1e1",
    200: "#ffc7c8",
    300: "#ff9b9d",
    400: "#f9585c",
    500: "#ee2126",
    600: "#e10b0f",
    700: "#be080c",
    900: "#7c0508",
  },
  /** Payments / Offers / Settings chrome. */
  indigo: {
    50: "#f3effe",
    100: "#e7e0fd",
    200: "#cfc2fb",
    300: "#a78bf8",
    400: "#7a4cf0",
    500: "#5a22e6",
    600: "#460ddc",
    700: "#3708b0",
    800: "#2b1585",
    900: "#1d0a76",
  },
  ink: {
    default: "#111827",
    soft: "#374151",
    muted: "#6b7280",
    faint: "#9ca3af",
  },
  surface: { default: "#ffffff", sunken: "#f6f7f9", raised: "#fbfbfd" },
  line: { default: "#ecedf2", strong: "#dfe3e8" },
  ok: { default: "#16a34a", soft: "#e7f7ee", ink: "#0f7a38" },
  warn: { default: "#ea8c00", soft: "#fff3e2", ink: "#b45309" },
  bad: { default: "#e10b0f", soft: "#fdecec", ink: "#b91c1c" },
  info: { default: "#2563eb", soft: "#e8f1fe", ink: "#1d4ed8" },
  violet: { default: "#6d28d9", soft: "#f1ecfe", ink: "#5b21b6" },
  orange: { default: "#f97316", soft: "#fff1e3", ink: "#c2410c" },
  veg: "#16a34a",
  nonveg: "#dc2626",
} as const;

/** The indigo header wash on Payments, Offers and Settings. */
export const indigoHeader = [colors.indigo[900], colors.indigo[800]] as const;

/**
 * Pastel icon plates. Every tinted circle and squircle in the reference comes
 * from this set, so screens stay in the same key rather than each picking its
 * own pastel.
 */
export const tints = {
  green: { bg: "#e7f7ee", fg: "#16a34a" },
  blue: { bg: "#e8f1fe", fg: "#2563eb" },
  amber: { bg: "#fff3e2", fg: "#ea8c00" },
  violet: { bg: "#f1ecfe", fg: "#6d28d9" },
  red: { bg: "#fdecec", fg: "#e10b0f" },
  teal: { bg: "#e4f7f5", fg: "#0d9488" },
  pink: { bg: "#fdeaf3", fg: "#db2777" },
  slate: { bg: "#eef1f6", fg: "#475569" },
} as const;

export type TintName = keyof typeof tints;

/** Category thumbnails cycle these so a long menu reads as a palette. */
const tintCycle: TintName[] = ["amber", "green", "blue", "red", "violet", "teal", "pink", "slate"];

export function categoryTint(index: number) {
  return tints[tintCycle[index % tintCycle.length]];
}

/* ── Order lifecycle ────────────────────────────────────────────────────── */

export type OrderStageKey =
  | "new"
  | "preparing"
  | "ready"
  | "picked"
  | "delivered"
  | "cancelled";

/**
 * One place decides how a stage looks and reads. The reference gives each card
 * a coloured rail down its left edge plus a matching chip, so both live here.
 */
export const stageStyle: Record<
  OrderStageKey,
  { label: string; short: string; tint: TintName; rail: string }
> = {
  new: { label: "New Orders", short: "New", tint: "green", rail: colors.ok.default },
  preparing: { label: "Preparing", short: "Preparing", tint: "amber", rail: colors.orange.default },
  ready: { label: "Ready", short: "Ready", tint: "blue", rail: colors.info.default },
  picked: {
    label: "Out for Delivery",
    short: "Out for Delivery",
    tint: "violet",
    rail: colors.violet.default,
  },
  delivered: { label: "Delivered", short: "Delivered", tint: "green", rail: colors.ok.default },
  cancelled: { label: "Cancelled", short: "Cancelled", tint: "red", rail: colors.bad.default },
};

export type Tone = "ok" | "warn" | "bad" | "info" | "brand" | "indigo" | "neutral";

export const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: colors.ok.soft, fg: colors.ok.default },
  warn: { bg: colors.warn.soft, fg: colors.warn.default },
  bad: { bg: colors.bad.soft, fg: colors.bad.default },
  info: { bg: colors.info.soft, fg: colors.info.default },
  brand: { bg: colors.brand[50], fg: colors.brand[600] },
  indigo: { bg: colors.indigo[50], fg: colors.indigo[600] },
  neutral: { bg: "#eef1f6", fg: colors.ink.soft },
};

/**
 * Elevation. The reference is near-flat — cards separate with a hairline
 * border, and the only real shadow is the panel that overlaps the indigo
 * header.
 */
export const shadow = {
  card: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  raised: {
    shadowColor: "#0f172a",
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;
