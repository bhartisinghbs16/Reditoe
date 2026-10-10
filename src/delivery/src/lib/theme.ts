/**
 * Design tokens.
 *
 * The delivery-partner app reproduces the client's reference screens rather
 * than reinterpreting them. Two accents run through the whole app exactly as
 * the reference draws them:
 *
 *   green  — the primary. Earnings banners, Accept, the Online pill, the
 *            Verified chip, every rupee figure.
 *   red    — the brand and the chrome. Auth CTAs, the Scan button in the tab
 *            bar, the active tab, elapsed-time text, Reject.
 *
 * Values were sampled from the reference PNGs, so keep this file and
 * `tailwind.config.js` in step — NativeWind styles the JSX, this serves the
 * places that need raw values (navigation options, gradients, icon colours,
 * chart marks).
 */

export const colors = {
  brand: {
    50: "#fef0f0",
    100: "#fddcdc",
    200: "#fbbcbc",
    300: "#f78d8d",
    400: "#f25050",
    500: "#ee2027",
    600: "#e10b0f",
    700: "#be080c",
    900: "#7c0508",
  },
  green: {
    50: "#e9f7ef",
    100: "#cfeedd",
    200: "#a7dfc0",
    300: "#6ec996",
    400: "#33ad6d",
    500: "#16a34a",
    600: "#0f8a3c",
    700: "#0b7a33",
    800: "#086128",
    900: "#054d1f",
  },
  ink: {
    default: "#0f172a",
    soft: "#334155",
    muted: "#64748b",
    faint: "#94a3b8",
  },
  surface: { default: "#ffffff", sunken: "#f4f6f8", raised: "#fafbfc" },
  line: { default: "#e8ebf0", strong: "#d8dee6" },
  ok: { default: "#16a34a", soft: "#e6f6ec", ink: "#0b7a33" },
  warn: { default: "#f59e0b", soft: "#fff3e0", ink: "#b45309" },
  bad: { default: "#e8322a", soft: "#feecec", ink: "#b91c1c" },
  info: { default: "#2563eb", soft: "#e8f0fe", ink: "#1d4ed8" },
  violet: { default: "#7c3aed", soft: "#f1ecfe", ink: "#5b21b6" },
  orange: { default: "#f97316", soft: "#fff1e6", ink: "#c2410c" },
  star: "#f59e0b",
} as const;

/** The green wash behind Today's Earnings and the Wallet Balance banner. */
export const greenHeader = [colors.green[700], colors.green[600]] as const;

/**
 * Pastel icon plates. Every tinted circle and squircle in the reference comes
 * from this set, so screens stay in the same key rather than each picking its
 * own pastel.
 */
export const tints = {
  green: { bg: "#e6f6ec", fg: "#16a34a" },
  blue: { bg: "#e8f0fe", fg: "#2563eb" },
  violet: { bg: "#f1ecfe", fg: "#7c3aed" },
  amber: { bg: "#fff3e0", fg: "#f59e0b" },
  orange: { bg: "#fff1e6", fg: "#f97316" },
  red: { bg: "#feecec", fg: "#e8322a" },
  teal: { bg: "#e4f7f5", fg: "#0d9488" },
  slate: { bg: "#eef1f6", fg: "#475569" },
} as const;

export type TintName = keyof typeof tints;

/** Order thumbnails and payout rows cycle these so a long list reads as a palette. */
const tintCycle: TintName[] = [
  "green",
  "blue",
  "violet",
  "amber",
  "red",
  "teal",
  "orange",
  "slate",
];

export function cycleTint(index: number) {
  return tints[tintCycle[index % tintCycle.length]];
}

/* ── Banners ────────────────────────────────────────────────────────────── */

/**
 * The reference closes most screens with a tinted note strip. Four recur, so
 * they live here rather than being re-picked per screen.
 */
export const noteStyle = {
  green: { bg: "#edf9f1", border: "#cdebd8", fg: colors.green[700] },
  blue: { bg: "#eef3ff", border: "#dce6ff", fg: colors.info.default },
  amber: { bg: "#fff8eb", border: "#fbe3b8", fg: colors.warn.ink },
  red: { bg: "#fef2f2", border: "#fbd5d5", fg: colors.brand[600] },
  slate: { bg: "#f5f7fa", border: colors.line.default, fg: colors.ink.soft },
} as const;

export type NoteTone = keyof typeof noteStyle;

/* ── Trip lifecycle ─────────────────────────────────────────────────────── */

export type TripStage =
  | "offered"
  | "accepted"
  | "at_restaurant"
  | "picked_up"
  | "at_customer"
  | "delivered"
  | "cancelled";

/**
 * One place decides how a stage reads and looks. The reference gives a new
 * offer an amber "New" chip on a cream card, work-in-hand a blue chip, and a
 * finished trip a green one.
 */
export const stageStyle: Record<
  TripStage,
  { label: string; short: string; tint: TintName; tone: Tone }
> = {
  offered: { label: "New Order", short: "New", tint: "amber", tone: "warn" },
  accepted: { label: "Accepted", short: "Accepted", tint: "blue", tone: "info" },
  at_restaurant: {
    label: "Reached Restaurant",
    short: "At Restaurant",
    tint: "blue",
    tone: "info",
  },
  picked_up: { label: "Picked Up", short: "Picked Up", tint: "blue", tone: "info" },
  at_customer: { label: "On the Way", short: "On the Way", tint: "violet", tone: "violet" },
  delivered: { label: "Delivered", short: "Delivered", tint: "green", tone: "ok" },
  cancelled: { label: "Cancelled", short: "Cancelled", tint: "red", tone: "bad" },
};

export type Tone =
  | "ok"
  | "warn"
  | "bad"
  | "info"
  | "violet"
  | "brand"
  | "green"
  | "neutral";

export const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: colors.ok.soft, fg: colors.ok.ink },
  warn: { bg: colors.warn.soft, fg: colors.warn.ink },
  bad: { bg: colors.bad.soft, fg: colors.bad.default },
  info: { bg: colors.info.soft, fg: colors.info.default },
  violet: { bg: colors.violet.soft, fg: colors.violet.default },
  brand: { bg: colors.brand[50], fg: colors.brand[600] },
  green: { bg: colors.green[50], fg: colors.green[700] },
  neutral: { bg: "#eef1f6", fg: colors.ink.soft },
};

/** Verification state on documents and payouts. */
export const docTone: Record<string, Tone> = {
  Verified: "ok",
  Success: "ok",
  Credited: "ok",
  Pending: "warn",
  Processing: "info",
  Expired: "bad",
  Failed: "bad",
  Debited: "bad",
  Rejected: "bad",
};

/**
 * Elevation. The reference is near-flat — cards separate with a hairline
 * border, and the only real shadow is the raised Scan button in the tab bar.
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
