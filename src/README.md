# Multi-Vendor Food Delivery Platform

Working repository for the multi-vendor food delivery platform (admin panel, customer app,
vendor app, delivery partner app, backend API).

## Repository layout

```
working/
├── backend/     Node.js + Express + MongoDB API (shared by all clients) — done
├── admin/       Admin panel — Next.js 16 + TypeScript + Tailwind v4 + shadcn/ui — done
├── user/        Customer mobile app (React Native / Expo)          [next]
├── vendor/      Vendor mobile app (React Native / Expo)            [pending]
├── vendor-web/  Vendor web console — Next.js 16 + Tailwind v4 + shadcn/ui — done
├── delivery/    Delivery partner mobile app (React Native / Expo)  [pending]
└── docs/        Requirements, API notes, design system
```

The backend is carried over from the base source unchanged — only the client
applications are redesigned.

## Design policy

Two policies apply, by surface.

**`vendor/` — reproduce the reference.** At the client's direction the vendor app is a
visual copy of the supplied reference screens, not an interpretation of them. Brand
values were sampled from the reference PNGs: Reditoe red `#E10B0F` on Dashboard, Orders
and Menu; indigo `#460DDC` over a `#1D0A76 → #2B1585` header on Payments and Settings.
Screen layouts follow the reference panel for panel. Tokens live in
[vendor/src/lib/theme.ts](vendor/src/lib/theme.ts) and `vendor/tailwind.config.js`.

**`vendor-web/` — reproduce the reference.** Same policy, applied to the desktop console
the client's two web reference screens describe: a white sidebar with the Reditoe lockup
and a red-tinted active pill, page title in the topbar, near-white page under white
hairline cards, pastel circular icon tiles per metric, and indigo "View All" links so red
stays reserved for actions. Every page — dashboard, orders, menu, offers, payments,
analytics, reviews, profile, settings — is laid out panel for panel against its reference.
Tokens live in [vendor-web/src/app/globals.css](vendor-web/src/app/globals.css) and the
tone palette in [vendor-web/src/lib/accent.ts](vendor-web/src/lib/accent.ts).

Where the reference's own sample figures don't reconcile (its analytics total row divides
to a different average than its headline; its ratings histogram doesn't sum to its review
count), the fixtures are made internally consistent and the reference's shape is kept.
Those two departures are commented at their definitions in `vendor-web/src/lib/data.ts`.

**`delivery/` — reproduce the reference.** Same policy, applied to every page of the
delivery-partner app. Two accents run through it exactly as the reference draws them:
green `#0F8A3C` is the primary — earnings banners, Accept, the Online pill, the Verified
chip and every rupee figure — while Reditoe red `#EE2027` carries the brand and the
chrome: auth CTAs, the raised Scan button in the tab bar, the active tab, elapsed-time
text and Reject. Tokens live in [delivery/src/lib/theme.ts](delivery/src/lib/theme.ts)
and `delivery/tailwind.config.js`.

Every screen the reference draws is built panel for panel: Login, Create Account, OTP,
Complete Your Profile, the four-step KYC flow (Aadhaar → PAN → Driving Licence → Bank)
and its success screen, Dashboard, Orders, Scan, Earnings, Profile, Personal Information,
Documents and the document detail, Payout Summary and Payout to Bank. Three screens the
reference names but does not draw — order detail, Settings, Help & Support — are
assembled from the same vocabulary rather than invented in another style.

Two departures, both where the reference contradicts itself:

- Its Payout to Bank breakdown lists ₹3,350 of earnings, deducts TDS ₹335 and charges
  ₹100, and still prints ₹3,250. The app follows the variant that reconciles — gross less
  charges — computes the figure from the line items so it cannot drift, and keeps the TDS
  sentence as the note the reference sets beneath it.
- Its Earnings side panel prints today as ₹650 while its Dashboard prints ₹1,250 for the
  same day. The app uses one figure throughout.

**Everywhere else — original system.** The reference screens describe *what the product
must do*; their visual design is not reproduced:

| | Reference screens | Admin / user |
|---|---|---|
| Sidebar | Dark navy, heavy | Light, bordered, airy |
| Accent | Red | Indigo / violet |
| Density | Compact, boxed | Generous whitespace, soft cards |
| Type | Default sans | Inter with a defined type scale |

Functional parity is required everywhere. Visual parity is required in `vendor/`,
`vendor-web/` and `delivery/`, and explicitly **not** required in `admin/` or `user/`.

## Prerequisites

- Node.js 18+ (developed on 24.18)
- MongoDB running locally, or a MongoDB Atlas connection string
- npm 9+

## Getting started

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # then fill in values
npm run dev               # http://localhost:5000
```

Health check: `GET http://localhost:5000/api/health`

### 2. Admin panel

```bash
cd admin
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

Sign in with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` from the backend `.env`. Only
accounts with `role: "admin"` can log in.

Other scripts:

```bash
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

> **Windows note.** Both `dev` and `build` are pinned to `--webpack`. Next 16's
> Turbopack builder hits `EBUSY` file-lock errors on this machine's filesystem;
> webpack builds cleanly. Drop the flag if you're on a machine where Turbopack
> works — it's faster.

## Documentation

- [docs/ADMIN_REQUIREMENTS.md](docs/ADMIN_REQUIREMENTS.md) — functional spec for the admin panel
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — colors, type, spacing, component rules
- [docs/API.md](docs/API.md) — backend API surface
