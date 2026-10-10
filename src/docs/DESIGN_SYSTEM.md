# Design system

The client supplied reference screens that describe **what the product must do**.
Their visual design is deliberately **not** reproduced. This document is the
original design language every surface in this repo is built from.

> **Exception — the vendor app.** At the client's direction `vendor/` is a visual
> *copy* of the reference screens rather than an interpretation of them, so
> nothing below applies to it. Its tokens are sampled from the reference PNGs and
> live in [vendor/src/lib/theme.ts](../vendor/src/lib/theme.ts) and
> `vendor/tailwind.config.js`: Reditoe red `#E10B0F` for the Dashboard, Orders and
> Menu chrome, indigo `#460DDC` over a `#1D0A76 → #2B1585` header for Payments and
> Settings, near-flat cards on `#F6F7F9`, and a per-tab active accent in the tab
> bar. Its component vocabulary is
> [vendor/src/components/ui](../vendor/src/components/ui/index.tsx).

## Distance from the reference

| | Reference screens | This project |
|---|---|---|
| Sidebar | Dark navy, full-bleed, heavy | White, hairline border, colour-coded icons |
| Accent | Red (#E11) only | Eight hues, one per area of the console |
| Active nav | Solid red pill | Filled gradient tile + tinted row |
| Cards | Boxed, tight, drop shadows | 1px border, 12px radius, near-flat |
| Density | Compact, crowded | Generous whitespace, 4px rhythm |
| Type | Default system sans | Inter, defined scale, tabular figures in tables |
| Charts | Saturated blocks, heavy grid | Thin marks, hairline grid, validated palette |

## Tokens

All tokens live in [admin/src/app/globals.css](../admin/src/app/globals.css) as CSS
custom properties, exposed to Tailwind through `@theme inline`. Nothing is
hard-coded in components.

### Surfaces

| Role | Light | Dark |
|---|---|---|
| Page background | `oklch(0.985 0.003 264)` — soft cool grey | `oklch(0.185 0.028 264)` |
| Card / sidebar | `#ffffff` | `oklch(0.235 0.03 264)` |
| Border | `oklch(0.923 0.012 256)` | `oklch(1 0 0 / 11%)` |

### Brand

- **Primary** — indigo `oklch(0.511 0.262 277)`. Buttons, active nav, links, focus rings.
- **Accent** — a violet-tinted wash used for active states and soft chips.
- Gradients (`indigo-500 → violet-600`) appear only on the brand mark, the login
  panel and avatar fallbacks — never on data.

### Accent hues — wayfinding colour

Each area of the console owns a hue, defined in
[admin/src/lib/accent.ts](../admin/src/lib/accent.ts). Every surface belonging
to that area wears it: the sidebar icon tile, the page-header badge, the module
cards. That makes "am I in Finance or Marketing?" answerable without reading.

| Area | Hue | | Area | Hue |
|---|---|---|---|---|
| Dashboard / Orders | Indigo | | Menu / Insights | Amber |
| Customers / System | Violet | | Support | Sky |
| Restaurants | Rose | | Marketing | Fuchsia |
| Delivery partners | Teal | | Finance | Emerald |

Each hue ships six forms — `tile` (filled gradient, white content), `soft`
(tinted square), `text`, `activeBg`, `rail`, `bar`. Use the named form; never
hand-pick a Tailwind colour in a component.

**Two things never use this palette:**

- **Status badges** — reserved meanings (success / warning / danger / info).
- **Chart series** — the validated categorical slots.

Mixing decoration into either would make a colour stop meaning one thing. The
page background carries only a very light top wash of the area's hue; surfaces
stay white, and numbers always sit on white.

### Status

Reserved meanings, never reused as series colours:
`success` (emerald), `warning` (amber), `info` (blue), `danger` (rose).
Each ships as a `-muted` background + `-foreground` text pair so badges stay
legible in both modes. See
[status-badge.tsx](../admin/src/components/common/status-badge.tsx) for the
single status → tone mapping used everywhere.

### Radii & elevation

- `--radius: 0.75rem`. Cards `rounded-xl`, controls `rounded-lg`, chips `rounded-full`.
- Two shadow levels only: `.surface` (barely-there, for panels) and
  `.surface-raised` (for popovers/tooltips). Nothing else casts a shadow.

### Type

Inter, with `cv02/cv03/cv04/cv11` stylistic sets on.

| Use | Spec |
|---|---|
| Page title | 1.5rem / 600 / tracking-tight |
| Panel title | 0.9375rem / 600 |
| Body | 0.875rem |
| Secondary | 0.8125rem, muted |
| Eyebrow (`.label-eyebrow`) | 0.6875rem / 600 / uppercase / 0.08em |

Tables and axis ticks use `tabular-nums`; large standalone figures (stat tiles,
hero numbers) deliberately do **not** — equal-width digits look loose at display
sizes.

## Chart palette

**The categorical palette is computed, not chosen.** It was validated with the
dataviz skill's `validate_palette.js` against the actual chart surface in both
modes — lightness band, chroma floor, adjacent-pair CVD separation
(protanopia/deuteranopia, Machado 2009 @ 1.0), the normal-vision floor, and 3:1
contrast.

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | indigo | `#6366f1` | `#6366f1` |
| 2 | amber | `#d97706` | `#d97706` |
| 3 | teal | `#0d9488` | `#0d9488` |
| 4 | rose | `#f43f5e` | `#f43f5e` |
| 5 | emerald | `#059669` | `#059669` |
| 6 | violet | `#7c3aed` | `#8b5cf6` |
| 7 | sky | `#0284c7` | `#0284c7` |
| 8 | orange | `#ea580c` | `#ea580c` |

Only slot 6 differs between modes — violet lifts one step to clear 3:1 on the
dark card surface.

**Rules that are not negotiable:**

- Slots are assigned in fixed order and **never cycled**. Past 8 series, fold the
  tail into "Other" (the donut does this automatically past 6 segments).
- Colour follows the entity, never its rank — filtering never repaints survivors.
- **No dual-axis charts.** Two measures of different scale get two charts.
- Status colours never stand in for "series 4", and vice versa.
- Every chart ships a **table view** toggle, so no value is reachable only by
  hovering.
- A legend is always present for ≥ 2 series; a single series has none (the panel
  title names it).
- Text wears text tokens, never the series colour. Identity comes from the
  coloured chip beside the label.

If you change any chart colour, re-run the validator before shipping:

```bash
node scripts/validate_palette.js "#6366f1,#d97706,#0d9488,#f43f5e,#059669,#7c3aed,#0284c7,#ea580c" \
  --mode light --surface "#ffffff"
node scripts/validate_palette.js "#6366f1,#d97706,#0d9488,#f43f5e,#059669,#8b5cf6,#0284c7,#ea580c" \
  --mode dark --surface "#171e2c"
```

### Mark specs

- Bars ≤ 24px thick, 4px rounded data-end, square at the baseline.
- Lines 2px, round caps; markers appear on hover only, with a 2px surface ring.
- Area fills ≈ 10–14% opacity — a wash, never a block.
- Gridlines: solid hairlines, one step off the surface, horizontal only.
- Stacked segments separated by a 2px gap in the surface colour, not a border.

## Component vocabulary

| Component | Purpose |
|---|---|
| `PageHeader` | Title, description, breadcrumbs, actions. Every page starts with one. |
| `Panel` | The standard titled surface. `flush` for self-padding content like tables. |
| `StatCard` / `StatGrid` | The KPI row. Label, value, optional delta chip, tinted icon tile. |
| `DataTable` + `TablePagination` | Every list. Handles loading, error, empty, selection, responsive column hiding. |
| `ResourceListPage` | Header + stats + filtered table + pager — the shape ~30 screens share. |
| `TaxonomyPage` | Categories and cuisines, which are the same screen with different nouns. |
| `StatusBadge` | The only way a status is rendered. Owns the status → tone map. |
| `IdentityCell` / `StackedCell` | Person/business rows and two-line values in tables. |
| `EmptyState` / `ErrorState` | Consistent zero and failure states, with retry. |
| `FilterBar` / `SearchField` / `FilterSelect` / `SegmentedTabs` | One filter row above what it scopes — never inside a card. |

## Interaction rules

- **Filters live in one row above everything they scope.** Never per-card.
- **No skeleton flash on refetch** — React Query keeps the previous page
  (`placeholderData`) while the next one loads.
- Search is debounced 300ms; any filter change returns to page 1.
- Row click navigates; controls inside a row `stopPropagation`.
- Destructive actions confirm in a dialog and say what happens.
- Toasts report the outcome of a write; they never carry information that isn't
  also on screen.

## Accessibility

- Both light and dark are *selected*, not an automatic inversion.
- Focus rings come from `--ring` and are never removed.
- Status is never colour-alone — every badge carries a label, and most carry a dot.
- Table headers are `<th scope="col">`; icon-only buttons carry `aria-label`.
- Hit targets meet 24px minimum; chart tooltips have a table-view twin.
