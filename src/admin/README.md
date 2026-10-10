# Admin console

Operations console for the multi-vendor delivery marketplace.

Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui (Radix) ·
TanStack Query · Recharts.

## Run it

```bash
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL
npm run dev                  # http://localhost:3000
```

The backend must be running (see `../backend`). Sign in with an account whose
`role` is `admin`.

### Reviewing without a backend

```bash
echo NEXT_PUBLIC_MOCK=1 >> .env.local
npm run dev
```

Every API call is answered from `src/lib/mock-data.ts` — deterministic sample
data covering all 51 screens, with no database and no sign-in. Use it to review
the UI or demo to a client. Remove the flag to talk to the real API.

| Script | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

> `dev` and `build` are pinned to `--webpack`; Next 16's Turbopack builder hits
> `EBUSY` file-lock errors on some Windows filesystems. Remove the flag if
> Turbopack works for you.

## Layout

```
src/
├── app/
│   ├── (console)/       Everything behind auth — one folder per module
│   ├── login/           Sign-in
│   ├── layout.tsx       Fonts + providers
│   ├── globals.css      The design tokens live here
│   └── not-found.tsx
├── components/
│   ├── shell/           Sidebar, topbar, command palette, brand, app shell
│   ├── common/          PageHeader, Panel, DataTable, StatCard, badges, filters…
│   ├── charts/          Chart kit + the four chart forms
│   ├── ui/              shadcn primitives (generated — edit sparingly)
│   └── providers.tsx    Query client, theme, session
└── lib/
    ├── api.ts            Fetch wrapper, envelope unwrapping, token storage
    ├── queries.ts        Every endpoint the console calls — the single source
    ├── types.ts          Backend document shapes
    ├── domain.ts         Status vocabularies and filter options
    ├── nav.ts            Sidebar structure + command-palette index
    ├── format.ts         Currency, dates, numbers, phones
    └── use-list-state.ts Filter/paging state for list screens
```

## Conventions

- **Adding a list screen** — use `ResourceListPage`. Supply columns, a filter
  row and a query hook from `queries.ts`; it handles loading, error, empty,
  selection and paging.
- **New endpoint** — declare it in `lib/queries.ts`, never inline in a page.
- **New status value** — add it to the map in `components/common/status-badge.tsx`
  so it colours consistently everywhere.
- **Charts** — read [`../docs/DESIGN_SYSTEM.md`](../docs/DESIGN_SYSTEM.md) first.
  The palette is validated, not chosen; don't substitute colours by eye.
- **Design** — the client's reference screens define behaviour only. Their visual
  design is deliberately not reproduced.
