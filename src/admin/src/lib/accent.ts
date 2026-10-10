/**
 * Accent hues.
 *
 * Colour here is for wayfinding, not decoration: each area of the console owns
 * a hue, and every surface that belongs to that area — sidebar icon, page
 * badge, stat tile — wears it. That makes "am I in Finance or Marketing?"
 * answerable at a glance.
 *
 * Two things deliberately do NOT use this palette:
 *   - status badges, which carry reserved meaning (success/warning/danger)
 *   - chart series, which use the validated categorical slots
 * Mixing either into decoration would make a colour stop meaning one thing.
 */

export type Hue =
  | "indigo"
  | "violet"
  | "emerald"
  | "amber"
  | "sky"
  | "rose"
  | "teal"
  | "fuchsia";

interface HueStyle {
  /** Filled gradient tile with white content — the loudest use. */
  tile: string;
  /** Soft tinted square with coloured content — the quieter use. */
  soft: string;
  /** Icon / text colour on a plain surface. */
  text: string;
  /** Tinted background for an active nav row. */
  activeBg: string;
  /** The rail that marks an active row. */
  rail: string;
  /** Thin accent line at the top of a card. */
  bar: string;
}

export const HUES: Record<Hue, HueStyle> = {
  indigo: {
    tile: "bg-gradient-to-br from-indigo-500 to-indigo-600 text-white",
    soft: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
    text: "text-indigo-600 dark:text-indigo-400",
    activeBg: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300",
    rail: "bg-indigo-500",
    bar: "from-indigo-400 to-indigo-600",
  },
  violet: {
    tile: "bg-gradient-to-br from-violet-500 to-purple-600 text-white",
    soft: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    text: "text-violet-600 dark:text-violet-400",
    activeBg: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    rail: "bg-violet-500",
    bar: "from-violet-400 to-purple-600",
  },
  emerald: {
    tile: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
    soft: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    text: "text-emerald-600 dark:text-emerald-400",
    activeBg:
      "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    rail: "bg-emerald-500",
    bar: "from-emerald-400 to-teal-600",
  },
  amber: {
    tile: "bg-gradient-to-br from-amber-400 to-orange-500 text-white",
    soft: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-400",
    activeBg: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    rail: "bg-amber-500",
    bar: "from-amber-400 to-orange-500",
  },
  sky: {
    tile: "bg-gradient-to-br from-sky-500 to-blue-600 text-white",
    soft: "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
    text: "text-sky-600 dark:text-sky-400",
    activeBg: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    rail: "bg-sky-500",
    bar: "from-sky-400 to-blue-600",
  },
  rose: {
    tile: "bg-gradient-to-br from-rose-500 to-pink-600 text-white",
    soft: "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
    text: "text-rose-600 dark:text-rose-400",
    activeBg: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    rail: "bg-rose-500",
    bar: "from-rose-400 to-pink-600",
  },
  teal: {
    tile: "bg-gradient-to-br from-teal-500 to-cyan-600 text-white",
    soft: "bg-teal-50 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300",
    text: "text-teal-600 dark:text-teal-400",
    activeBg: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300",
    rail: "bg-teal-500",
    bar: "from-teal-400 to-cyan-600",
  },
  fuchsia: {
    tile: "bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white",
    soft: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    activeBg:
      "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
    rail: "bg-fuchsia-500",
    bar: "from-fuchsia-400 to-pink-600",
  },
};

/** Hue owned by each sidebar section — the source of truth for wayfinding. */
export const SECTION_HUE: Record<string, Hue> = {
  Overview: "indigo",
  Finance: "emerald",
  Marketing: "fuchsia",
  Insights: "amber",
  Support: "sky",
  System: "violet",
};

/** Resolves the hue for a route by matching its section's nav prefixes. */
const ROUTE_HUES: Array<[string, Hue]> = [
  ["/dashboard", "indigo"],
  ["/orders", "indigo"],
  ["/customers", "violet"],
  ["/restaurants", "rose"],
  ["/partners", "teal"],
  ["/menu", "amber"],
  ["/finance", "emerald"],
  ["/marketing", "fuchsia"],
  ["/reports", "amber"],
  ["/analytics", "amber"],
  ["/reviews", "amber"],
  ["/support", "sky"],
  ["/system", "violet"],
  ["/notifications", "sky"],
];

export function hueForRoute(pathname: string): Hue {
  const match = ROUTE_HUES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  return match?.[1] ?? "indigo";
}
