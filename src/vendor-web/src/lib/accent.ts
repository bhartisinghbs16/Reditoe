/**
 * Tones.
 *
 * The reference screens colour by *meaning*, not by area: a pastel circle
 * behind a line-art glyph, one hue per kind of number. Orders are green, money
 * is blue, anything in progress is amber, customers/insights are violet, and
 * red is reserved for the brand and for things that went wrong.
 *
 * Two things deliberately do NOT use this palette:
 *   - status badges, which carry reserved meaning (success/warning/danger)
 *   - chart series, which use the validated categorical slots
 * Mixing either into decoration would make a colour stop meaning one thing.
 */

export type Tone = "red" | "green" | "blue" | "amber" | "violet" | "slate";

interface ToneStyle {
  /** Pastel circle + coloured glyph — the reference's stat-card icon. */
  circle: string;
  /** Tinted card face, used by the Order Status strip and quick-action tiles. */
  soft: string;
  /** Glyph / text colour on a plain surface. */
  text: string;
  /** Solid fill, for rails and progress bars. */
  solid: string;
  /** Chart series colour when a panel is single-series. */
  chart: string;
}

export const TONES: Record<Tone, ToneStyle> = {
  red: {
    circle: "bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300",
    soft: "bg-red-50/70 border-red-100 dark:bg-red-500/10 dark:border-red-500/20",
    text: "text-red-600 dark:text-red-400",
    solid: "bg-red-600",
    chart: "#e8112d",
  },
  green: {
    circle:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
    soft: "bg-emerald-50/70 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20",
    text: "text-emerald-600 dark:text-emerald-400",
    solid: "bg-emerald-600",
    chart: "#22a45d",
  },
  blue: {
    circle: "bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
    soft: "bg-blue-50/70 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/20",
    text: "text-blue-600 dark:text-blue-400",
    solid: "bg-blue-600",
    chart: "#2563eb",
  },
  amber: {
    circle: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
    soft: "bg-amber-50/70 border-amber-100 dark:bg-amber-500/10 dark:border-amber-500/20",
    text: "text-amber-600 dark:text-amber-400",
    solid: "bg-amber-500",
    chart: "#d97706",
  },
  violet: {
    circle:
      "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
    soft: "bg-violet-50/70 border-violet-100 dark:bg-violet-500/10 dark:border-violet-500/20",
    text: "text-violet-600 dark:text-violet-400",
    solid: "bg-violet-600",
    chart: "#6d28d9",
  },
  slate: {
    circle: "bg-muted text-muted-foreground",
    soft: "bg-muted/60 border-border",
    text: "text-muted-foreground",
    solid: "bg-slate-400",
    chart: "#64748b",
  },
};

/** The violet the reference uses for every revenue/earnings area chart. */
export const CHART_PRIMARY = "#6d28d9";
