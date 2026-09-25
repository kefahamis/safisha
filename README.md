# Safisha Waste Hub

A prototype platform for Nairobi waste collection, ported from a single-file HTML
prototype to a modular Next.js (App Router) application.

Four roles share one live dataset:

| Role | What it covers |
| --- | --- |
| **Client** | Account card, balance, M-Pesa payment, statement, live truck tracking, care desk |
| **Company** | Dashboard KPIs, client register, fleet map, M-Pesa reconciliation, statements, care inbox |
| **Collector** | Today's route sheet, GPS sharing toggle |
| **Admin** | City-wide overview, full client database, all-company map |

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
```

## Signing in

Every dashboard is behind a session. Pick any account from the list on the
sign-in page — they all use the password `safisha123`.

| Account | Role | Lands on |
| --- | --- | --- |
| `wanjiku@example.com` | Client | `/client` |
| `john.kiprop@takasafi.co.ke` | Collector | `/collector` |
| `care@takasafi.co.ke` | Care agent | `/company` (read-only billing) |
| `ops@takasafi.co.ke` | Company admin | `/company` |
| `admin@safisha.go.ke` | Platform admin | `/admin` |

Set `SESSION_SECRET` (see `.env.example`) before running in production; the
server refuses to sign tokens without it.

## Authentication and access control

**Sessions are HS256 JWTs** in an httpOnly, SameSite=Lax cookie, signed with
`jose` because `src/middleware.ts` verifies them on the Edge runtime. Passwords
are scrypt-hashed with a per-user salt and compared in constant time
(`src/server/password.ts`).

**Two layers of gating.** Middleware handles route level: it verifies the
signature and checks the workspace claim, so a client hitting `/admin` is
redirected to their own dashboard and an anonymous visitor is sent to
`/login?next=…`. Fine-grained permissions are resolved server-side per request
in `src/server/session.ts`, which re-reads the store each time — so an admin
revoking a permission takes effect on the very next request, without the
affected user signing out.

**Permissions, not roles, are what the app checks.** The catalogue lives in
`src/lib/auth/permissions.ts` as `resource.action` ids grouped for the admin
matrix. A role is a named bundle of them; a user holds one role plus optional
personal `grants` and `denies`. Effective set = role ∪ grants − denies, and
**deny always wins**, so one capability can be pulled from one person without
forking a role.

**Workspaces** decide which dashboard a role lands in. It travels in the token
because Edge middleware has no access to the server store; changing a role's
workspace therefore needs a fresh sign-in, while permission changes do not.

The admin manages all of this at `/admin/access` (role list plus the full
permission matrix, and creating custom roles) and `/admin/users` (role
assignment, per-person overrides with an inherit/allow/deny control, and
suspension). Both refuse to let an admin change their own role or suspend
themselves.

### What is and isn't enforced

Auth and RBAC are genuinely server-enforced: the API routes under
`/api/admin/*` call `requirePermission` and return 401/403, and middleware
cannot be bypassed from the client. The **waste-domain data remains a
client-side prototype** — clients, payments, tickets and trucks live in the
browser store, so `Can` around a button hides it but there is no server to
reject the write. Wiring that data to a real backend is the next step; the
permission checks to call are already named and in place.

Accounts and role edits are held in memory on the server (`accessStore.ts`) and
reset when the process restarts.

## How it is put together

```
src/
  middleware.ts            Edge route gate: verify token, check workspace
  app/
    layout.tsx             <html>, fonts, global CSS, session resolution
    providers.tsx          session + store + toasts, mounted once
    login/                 Sign-in, outside the authenticated shell
    (authed)/              Everything behind a session
      layout.tsx           AppShell
      client/ company/ collector/ admin/
    api/
      auth/                login · logout · me
      admin/               roles · users (permission-guarded)
  server/                  Server-only: never imported by a client component
    accessStore.ts         Roles and accounts, in memory
    jwt.ts                 Sign and verify HS256 sessions
    password.ts            scrypt hash and constant-time verify
    session.ts             getSession / requirePermission
  lib/auth/                Shared with the client
    permissions.ts         The permission catalogue
    defaultRoles.ts        Built-in roles and workspace access
    types.ts               Role, User, Session shapes
  features/                One component per screen, grouped by role
  components/
    layout/                Top bar, role tabs, context switcher, sidebar
    billing/               Statement table, period select, ID card, Paybill block
    clients/               Client register table, search, registration form
    map/                   Leaflet city map, fleet list, legend
    mpesa/                 STK Push modal, C2B simulator, suspense queue
    support/               Ticket list, thread, new-request form
    collector/             Route sheet, sharing toggle
    ui/                    Chips, panels, KPIs, page head, toasts, copy button
  lib/                     Framework-free domain layer
    types.ts               Every entity in the model
    reference/             Estates (real centroids) and companies
    seed.ts                Builds the whole demo dataset from a fixed seed
    selectors.ts           Balances, schedules, fleet status, monthly sums
    statement.ts           Running-account computation
    clientNumber.ts        Luhn check digit, number issuing and parsing
    format.ts clock.ts navigation.ts rng.ts
  store/
    appStore.ts            Observable store (version counter + listeners)
    actions.ts             Every mutation, typed and named
    StoreProvider.tsx      React bindings + the one-second fleet ticker
  styles/                  tokens · base · components · map · responsive
```

### Visual language

Built to a dashboard reference kept at `reference/palette-ref.webp`: a cool
grey-blue canvas, borderless white cards separated by soft shadow rather than
hairlines, a full-height dark navy rail carrying the brand and sections, a vivid
blue primary (`#3B6FF6`), and fully-rounded pills for buttons, chips and tabs.
KPI tiles follow the reference pattern — caption, figure, a thin fill rail, then
a trend pill beside the sub-caption.

Two deliberate departures: **IBM Plex Mono is kept** for client numbers, M-Pesa
receipts and coordinates, because those are strings people read character by
character and transcribe into a Paybill prompt; and **green stays as the success
colour** (paid up, collected, on route) rather than becoming blue, so status
never collides with the primary action colour.

All of it is token-driven in `src/styles/tokens.css` — retheming means editing
that one file, in both the light and dark blocks.

### The map

Leaflet (via `react-leaflet`) over **OpenStreetMap's standard raster tiles** —
open source, no API key, no sign-up. Estate coordinates are real WGS84
centroids, client gates are scattered within each estate's radius, and truck
positions interpolate along their route by metres travelled, so distances and
ETAs come from haversine rather than invented units.

Two things worth knowing. OSM ships a single light style, so **dark mode
recolours the tiles in CSS** (`invert` plus a hue rotation) instead of pulling a
second, key-gated basemap; light mode is desaturated so the markers stay
dominant. And OSM's [tile usage
policy](https://operations.osmfoundation.org/policies/tiles/) covers
development and light traffic like this — a real deployment should self-host
tiles or use a paid provider.

Leaflet touches `window` at import, so the map is loaded through
`next/dynamic` with `ssr: false`; `.mapwrap` sets `position: relative; z-index: 0`
to trap Leaflet's high internal z-indexes below the app's modals.

Earlier versions drew a hand-built SVG of Nairobi. A real basemap makes that
unnecessary — the roads, airports and neighbourhoods come with the tiles.

### Design notes

**The URL owns the role.** `roleFromPath` derives the active role from the
pathname, so the sidebar, context switcher and role tabs are all plain links and
every screen is deep-linkable. The store keeps each role's context (selected
client, company, truck) so switching back and forth is lossless.

**One store for the session.** `StoreProvider` sits above the route tree in the
root layout, so navigating between views never resets state. State is mutated in
place and a version counter drives `useSyncExternalStore`, which keeps the ported
logic close to the original without an external state library.

**Deterministic first render.** The dataset is generated by a seeded PRNG and the
demo clock is frozen at 25 Sep 2026 10:15. `elapsedMs` only advances from the
client-side ticker, so the server render and the first client render are
identical — no hydration mismatches. Numbers are grouped without `Intl` for the
same reason.

**Client numbers carry a check digit.** `TS-KIL-01427` is company · estate ·
sequence · Luhn digit. `parseClientNumber` is what lets the Paybill simulator
reject a mistyped account number into the suspense queue instead of crediting
the wrong client.

### Simulated, not real

M-Pesa is mocked end to end: STK Push walks through form → handset prompt →
callback, and the C2B form stands in for Safaricom's confirmation webhook. Both
show the Daraja-shaped payload they would receive. No money moves, and there is
no backend — all state is in memory and resets on reload.
