# Backend API

Node.js + Express + MongoDB. Carried over from the base source unchanged — only
the client applications are being redesigned.

- Base URL: `http://localhost:5000/api`
- Health: `GET /api/health`
- All admin routes sit under `/api/admin` and require a bearer token from
  `POST /api/admin/login`.

## Response envelope

Single documents:

```json
{ "status": "success", "data": { "order": { ... } } }
```

Paginated lists — note `total`, `page` and `totalPages` sit **beside** `data`,
not inside it:

```json
{
  "status": "success",
  "results": 20,
  "total": 12548,
  "page": 1,
  "totalPages": 628,
  "data": { "orders": [ ... ] }
}
```

Errors:

```json
{ "status": "error", "message": "Admin route not found" }
```

The client handles this in [admin/src/lib/api.ts](../admin/src/lib/api.ts):
`request()` unwraps `data`, while `fetchList()` reads the whole envelope so the
pager gets its counts.

## Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/login` | Returns `{ token, data: { user } }`. Rejects non-admin roles with 403. |
| GET | `/admin/auth/me` | Current admin profile. Used to restore a session. |
| POST | `/admin/auth/forgot-password` | Sends a reset link. |

The token is stored in `localStorage` and mirrored to a cookie so route gating
can happen before React boots.

## Admin route groups

All below are mounted under `/api/admin` and protected by `adminProtect`.

| Group | Path | Key operations |
|---|---|---|
| Dashboard | `/dashboard` | `analytics`, `revenue-trend`, `total-income`, `order-cancellations`, `new-customers`, `daily-activity` |
| Orders | `/orders` | list, `live`, `:id`, `:id/status`, `:id/assign-rider`, `:id/cancel`, `:id/refund`, `:id/dispute`, `:id/admin-notes` |
| Users (customers) | `/users` | list, `:id`, `:id/status`, `:id/orders`, `:id/refund` |
| Restaurants | `/restaurants` | list, create, `:id`, `:id/approve`, `:id/status`, `:id/commission`, `:id/kyc`, documents |
| Riders | `/riders` | list, create, `:id`, `:id/orders`, `:id/status`, `:id/kyc-status`, `:id/block`, `:id/per-km`, `:id/incentive`, `:id/penalty`, `tracking`, `analytics` |

### Restaurant documents

`POST /restaurants/:id/documents/:type` — multipart, field name `document`, with
optional `number` and `expiryDate`. `:type` is one of `fssai`, `pan`, `gst`,
`bank`, `aadhaar`, `shop`, `fire`, `health` (the older `foodLicense` and
`cancelledCheque` still resolve to `fssai` and `bank`). Uploading sets the
document to `pending` and clears any previous decision, so re-uploading is how
a vendor answers a rejection.

`PATCH /restaurants/:id/document-verification` — `{ documentType, status, note? }`
where status is `pending | verified | rejected`, recording who decided and when.
The older `{ documentVerificationStatus: { fssaiVerified, … } }` body still works.

Both recompute `restaurant.kycStatus` from the file: `approved` once all four
required documents (FSSAI, PAN, GST, bank) are verified, `rejected` if any of
them is rejected, `under_review` while anything is on file, else `pending`.
State lives in `restaurant.documentRecords`, keyed by type — see
[backend/utils/restaurantDocuments.js](../backend/utils/restaurantDocuments.js).
| Menu | `/menu-items` | CRUD for food items |
| Coupons | `/coupons` | CRUD |
| Campaigns | `/campaigns` | CRUD + analytics |
| Marketing | `/marketing` | banners, offers |
| Notifications | `/notifications` | admin notification feed |
| Payments | `/payments` | transaction log |
| Payouts | `/payouts` | vendor & rider payouts |
| Vendor settlements | `/vendor-settlements` | settlement cycles |
| Vendor withdrawals | `/vendor-withdrawals` | vendor cash-out requests |
| Rider withdrawals | `/rider-withdrawals` | rider cash-out requests |
| Invoices | `/invoices` | list, `:id` |
| Refunds | `/refunds` | refund requests |
| Disputes | `/disputes` | dispute queue |
| Reviews | `/reviews` | moderation |
| User support | `/user-support` | customer tickets |
| Vendor support | `/vendor-support` | vendor tickets |
| Tasks | `/tasks` | internal task board |
| RBAC | `/rbac` | roles and permissions |
| Reports | `/reports`, `/advanced-reports`, `/advanced-reporting` | exports |
| Analytics | `/analytics` | revenue, orders, advanced analytics |
| Settings | `/settings` | platform configuration |
| Activity | `/activity-logs` (root-level, not under `/admin`) | audit trail |
| Search | `/search` | global search |
| Bulk | `/bulk-operations` | bulk import/update |
| Files | `/files`, `/upload` | uploads |

Full route table: [backend/routes/admin/index.js](../backend/routes/admin/index.js).

## Order status values

The backend uses these exact strings — the client maps them to friendlier labels
in [admin/src/lib/domain.ts](../admin/src/lib/domain.ts):

`Pending` · `Payment Pending` · `Waiting for Confirmation` · `Order Confirmed` ·
`In Progress` · `Processing` · `Ready` · `OnWay` · `Delivered` · `Cancelled` ·
`RiderRejected`

Allowed transitions are enforced server-side; `Delivered` and `Cancelled` are
terminal.

## Running it

```bash
cd backend
npm install
cp .env.example .env     # set MONGODB_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run dev
```

Requires MongoDB. Local default is `mongodb://127.0.0.1:27017/vinsta`; set
`MONGODB_URI` for Atlas.

Seed scripts:

```bash
npm run seed:rbac        # roles & permissions
npm run seed:analytics   # sample analytics data
npm run seed:invoices
npm run seed:rider
npm run seed:all
```

## Where endpoints are named in the client

Every path the admin console calls is declared in one file:
[admin/src/lib/queries.ts](../admin/src/lib/queries.ts). If a path here differs
from the backend, fix it there — not in the page.
