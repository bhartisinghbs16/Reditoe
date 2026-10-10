# Admin panel — functional specification

Derived from the client's reference screens (`Reditoe India LLP/Admin pannel/`,
59 images) and the capabilities present in the base backend. The **functions**
below are the requirement; the reference visuals are not.

Legend: **Built** = implemented and wired to the API · **Partial** = screen built,
some actions still to wire · **Later** = planned, not in this pass.

## Navigation map

The console is organised into six groups. Every route below exists.

### Overview

| Screen | Route | State | Notes |
|---|---|---|---|
| Dashboard | `/dashboard` | Built | KPI row, orders/revenue trend, status donut, recent orders, live count, top restaurants |
| All orders | `/orders` | Built | Status tabs, 4 filters, search, bulk select, row actions (view / refund / cancel) |
| Order detail | `/orders/[id]` | Built | Items + amount breakdown, timeline, advance status, refund, cancel, internal notes, customer / restaurant / rider / address / payment panels |
| Live tracking | `/orders/live` | Built | Kanban by dispatch stage, polls every 20s, flags unassigned orders |
| Order analytics | `/orders/analytics` | Built | Trend, status mix, payment mix, busiest restaurants |
| Returns & refunds | `/orders/refunds` | Built | Request queue with value-at-stake stats |
| Customers | `/customers` | Built | Search, status filter, block/unblock |
| Customer detail | `/customers/[id]` | Built | Profile, wallet, addresses, order history |
| Customer groups | `/customers/groups` | Built | Segments with coverage share |
| Customer analytics | `/customers/analytics` | Built | Repeat rate, frequency buckets, top spenders, signups |
| Restaurants | `/restaurants` | Built | KYC + status filters, approve / suspend, revenue column |
| Restaurant detail | `/restaurants/[id]` | Built | Overview / compliance / commercials tabs, commission editor |
| Add restaurant | `/restaurants/new` | Built | Validated form → `POST /admin/restaurants` |
| Categories / Cuisines | `/restaurants/categories`, `/restaurants/cuisines` | Built | Shared taxonomy screen |
| KYC & documents | `/restaurants/kyc` | Built | Verification queue with inline approve |
| Restaurant performance | `/restaurants/performance` | Built | Revenue ranking + per-vendor table |
| Delivery partners | `/partners` | Built | Status / KYC / vehicle filters, verify KYC, block |
| Partner detail | `/partners/[id]` | Built | Profile, vehicle, delivery record, recent deliveries |
| Add partner | `/partners/new` | Built | Validated form incl. bank/UPI → `POST /admin/riders` |
| Partner documents | `/partners/documents` | Built | Verify / reject inline |
| Partner performance | `/partners/performance` | Built | Rating distribution, success rates |
| Partner earnings | `/partners/earnings` | Built | Top earners, per-delivery economics |
| Partner withdrawals | `/partners/withdrawals` | Built | Cash-out request queue |
| Menu items | `/menu` | Built | Cross-restaurant catalogue, diet/availability filters |
| Menu categories | `/menu/categories` | Built | Shared taxonomy screen |
| Combos & add-ons | `/menu/combos` | Built | Bundles with computed saving |

### Finance

| Screen | Route | State |
|---|---|---|
| Overview | `/finance` | Built — revenue chart, payout-state donut, module cards |
| Transactions | `/finance/transactions` | Built — inflow/outflow split, 4 filters |
| Settlements | `/finance/settlements` | Built — cycles, gross vs net payable |
| Vendor payouts | `/finance/payouts` | Built — payee, period, method, status |
| Commission & fees | `/finance/commission` | Built — computed platform take per restaurant |
| Invoices | `/finance/invoices` | Built — overdue derived from due date |
| Wallets | `/finance/wallets` | Built — held balance across customers/vendors/riders |

### Marketing

| Screen | Route | State |
|---|---|---|
| Offers & coupons | `/marketing/offers` | Built — usage-vs-cap meters, derived validity status |
| Campaigns | `/marketing/campaigns` | Built — budget burn, impressions, CTR |
| Push notifications | `/marketing/notifications` | Built — delivery and open rates |
| Banners | `/marketing/banners` | Built — placements and run windows |
| Referrals | `/marketing/referrals` | Built — referrer/referee pairs, rewards paid |

### Insights

| Screen | Route | State |
|---|---|---|
| Reports | `/reports` | Built — one shared range/format control, 7 export types |
| Analytics | `/analytics` | Built — demand & revenue, geography, revenue leaders |
| Reviews & ratings | `/reviews` | Built — rating filter, reply and visibility state |

### Support

| Screen | Route | State |
|---|---|---|
| Support tickets | `/support` | Built — priority/status filters |
| Disputes | `/support/disputes` | Built — value at stake, resolution |
| Tasks | `/support/tasks` | Built — assignment, due dates, overdue detection |

### System

| Screen | Route | State |
|---|---|---|
| Users & roles | `/system/roles` | Built — role table + full permission catalogue (7 modules, 24 permissions) |
| Settings | `/system/settings` | Built — 6 tabs: general, business, payments, delivery, notifications, security |
| Activity logs | `/system/activity` | Built — actor, action, module, IP, time |
| Your profile | `/system/profile` | Built — details + password change |
| Alerts inbox | `/notifications` | Built — admin-facing alert feed |

### Cross-cutting

- **Login** (`/login`) — admin-only; non-admin accounts are rejected by the API.
- **Command palette** — `Ctrl/⌘ K`, indexes every route.
- **404** — branded, with routes back into the console.
- **Theme** — light (default) and dark, both hand-tuned.

## Behaviours that apply everywhere

1. **Pagination** — server-side; `total` / `page` / `totalPages` come from the
   envelope beside `data`. Page size selectable 10 / 25 / 50 / 100.
2. **Filtering** — one filter row per screen, above the table. Search debounces
   300ms. Any filter change resets to page 1.
3. **Loading** — skeleton on first load only; refetches hold the previous page.
4. **Errors** — every list and chart has an error state with a retry, and says
   plainly when the API is unreachable.
5. **Empty** — every list has a purposeful empty state, with a create action
   where one makes sense.
6. **Writes** — optimistic-free; each mutation invalidates only the query scopes
   it can affect, then toasts the outcome.

## Deliberately not in this pass

- Map-based live tracking (needs a Google Maps key; the stage board covers the
  operational need meanwhile).
- Campaign and notification **composer** wizards — the list, analytics and
  detail surfaces exist; the multi-step create flows are the next increment.
- Bulk import (restaurants, coupons) — the API endpoints exist; no UI yet.
- In-app chat with customers/riders — the base backend has
  `orderCommunication`; not surfaced yet.

## Routes added while converting the reference screens

The reference draws several of these as screens in their own right rather than
panes inside another, so they became routes:

| Route | Reference screen |
|---|---|
| `/customers/[id]/profile` | Profile Information |
| `/restaurants/[id]/documents` | Documents |
| `/restaurants/[id]/operational` | Operational Details |
| `/restaurants/[id]/menu` | Menu Management (per restaurant) |
| `/restaurants/[id]/analytics` | Restaurant Analytics |

`/partners/new` became the reference's five-step wizard, and
`/partners/earnings` became Finance & Payouts with its Payout Details drawer.

## Known gaps against the backend

Some screens call endpoints that the base backend may not expose under the exact
path assumed (customer groups, wallets, taxonomy lists, tasks, referrals). These
render their error state cleanly rather than crashing. Confirm each against
`docs/API.md` and adjust the path in
[admin/src/lib/queries.ts](../admin/src/lib/queries.ts) — that file is the single
place every endpoint is named.

### Fields the reference shows that the API doesn't return

Converting the reference surfaced a concrete list of what the backend still
owes. Every one of these renders as an em-dash, or says plainly where the data
does live, rather than being dropped from the screen or filled with a
plausible-looking zero — so each screen doubles as its own to-do list.

| Area | Missing |
|---|---|
| Customer | Gender, blood group, date of birth, anniversary, alternate phone, referral chain (refer code, referred by, referral date, total referrals), loyalty points and tier, wallet total added |
| Restaurant | FSSAI licence, tagline, restaurant type, GST and PAN numbers, contact person's designation and alternate number, bank details, business hours, landmark |
| Restaurant documents | No document records at all — only a restaurant-wide `kycStatus` and `documentVerificationStatus`. The seven statutory documents are listed as a checklist; number, upload date and verifier are unknown |
| Menu | Add-ons have no representation; there is no bestseller flag (a rating of 4.5+ stands in); no per-restaurant category endpoint (categories are derived from the items) |
| Refunds | A refund record carries the order and customer but not the restaurant, so the reference's Restaurant column is left out |
| Delivery partner | Tips, incentives, payout runs, UTR / transaction id; bank details are captured but not returned by the riders endpoint |
| Uploads | No upload endpoint exists anywhere. Menu item images, partner documents and vehicle documents can be chosen but are not transmitted |

### Aggregation endpoints still needed

Several reference screens are period analytics; the API returns pages of
records, not aggregates. Where a figure can honestly be derived from the
records on hand it is, and the screen states its sample:

- **Restaurant Analytics** derives everything from that restaurant's most
  recent orders and says so in the header.
- **Returns & Refunds** charts describe the loaded page, not the date range.
- **Delivery partner payouts** compute TDS at the statutory 5% on gross.

Replacing these with real aggregates is a backend change, not a UI one.
