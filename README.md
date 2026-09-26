# Zoa Waste Hub

A platform for Nairobi waste collection: client accounts and M-Pesa billing,
live fleet tracking, collector route sheets with proof of collection, customer
care with Sheng/Kiswahili translation, on-demand pickups, dumping reports,
recycling tracking and USSD for clients without smartphones.

| Role | What it covers |
| --- | --- |
| **Client** | Account card, balance, pay by M-Pesa, statement, live truck tracking, book bulky/extra pickups, report illegal dumping, recycling figures, care chat |
| **Company** | Dashboard and trends, client register, fleet map, fleet management, M-Pesa payments and suspense, arrears and reminders, statements, pickup requests, dumping reports, recycling, care inbox, settings, audit log |
| **Collector** | Today's route (optimised order), proof of collection (photo, GPS, weight, waste type), on-demand jobs, GPS sharing, start-of-day vehicle check, fuel and incident reports — works offline |
| **Admin** | City overview and trends, all clients, all fleets, dumping reports, roles and users (with invitations), platform settings, audit log |

## Public website

`/` is the public site: services, how it works, an estate lookup for collection
days, recycling figures and the licensed companies, with every number taken
from the live data (`server/siteStats.ts`). Its colours come from the platform
brand tokens, so a rebrand in Settings carries through. Photos are from Unsplash
(free licence) in `public/site/`, credited in the footer; replace them with the
same file names to use your own. Signed-in visitors get "Open dashboard";
`/start` sends each person to their own workspace.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
npm run lint
npm test           # logic, plus a fresh-deploy and a demo database run
```

With no configuration the app runs on a local embedded database (below) in
**demo mode**: it is seeded with demo companies, clients and staff, and payments
run in simulated mode. Sign in with any account listed on the sign-in page; they
all use the password `zoa12345`.

| Account | Role | Lands on |
| --- | --- | --- |
| `wanjiku@example.com` | Client | `/client` |
| `john.kiprop@takasafi.co.ke` | Collector | `/collector` |
| `care@takasafi.co.ke` | Care agent | `/company` |
| `ops@takasafi.co.ke` | Company admin | `/company` |
| `accounts@takasafi.co.ke` | Staff · Finance & billing | `/company/desk` |
| `workshop@takasafi.co.ke` | Staff · Fleet & workshop | `/company/desk` |
| `admin@zoahub.co.ke` | Platform admin | `/admin` |

### Demo mode vs. a real deployment

`DEMO_DATA` decides which one you get. It defaults to on in development and
**off in production**.

| | Demo mode (`DEMO_DATA=1`) | Real deployment (`DEMO_DATA` unset or `0`) |
| --- | --- | --- |
| Empty database | Seeded with the demo world | Only the built-in roles, plus the first admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` |
| Sign-in page | Lists the demo accounts and password | Lists nothing |
| M-Pesa not connected | STK prompts and Paybill payments can be simulated | Refused: no money, no payment |
| M-Pesa sandbox keys | Paybill simulator asks Safaricom's sandbox | Same |
| M-Pesa production keys | Simulator refused | Simulator refused |

For a test deployment on Vercel (a preview, or a demo site), set `DEMO_DATA=1`
on that environment. Never set it on the database real clients use: the demo
accounts share a published password.

A real deployment starts empty. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (12+
characters) for the first deploy; that platform admin onboards companies and
estates at **Admin → Companies & estates**, then invites each company's admin
from **Users**.

## Database

PostgreSQL through [Drizzle ORM](https://orm.drizzle.team). Schema in
`src/server/db/schema.ts`, migrations in `drizzle/`. `npm run build` applies
them first (`scripts/migrate.mjs`), so a bad migration fails the deploy rather
than the first request; the app also checks on start, under a Postgres advisory
lock so instances starting together don't race. Companies and estates live in
the database, not in code.

- **Production:** set `DATABASE_URL` to your Postgres (Neon, Supabase, RDS, your
  own server…). It is required when `NODE_ENV=production`.
- **Development:** leave `DATABASE_URL` unset and the app runs
  [PGlite](https://pglite.dev) — real Postgres compiled to WebAssembly — in
  process, stored under `.data/pglite`. Nothing to install. Delete that folder
  to start over from the demo data.

After changing the schema: `npx drizzle-kit generate --name <change>`.

## Going live with payments

Everything third-party is configured in the app, under **Settings** — no code
or redeploy. Keys are encrypted at rest (AES-256-GCM) and are never sent back
to the browser; the form only shows whether one is saved and its last four
characters. Every change is written to the audit log (field names, never values).

**M-Pesa (per company — company admin, or the platform admin for any company):**

1. *Platform admin* → Settings → **Public address**: the HTTPS URL your
   deployment is reachable at. Safaricom calls back to it.
2. *Company admin* → Settings → **Payments**: environment (sandbox or
   production), Paybill or Till, short code, consumer key, consumer secret and
   Lipa na M-Pesa Online passkey from the [Daraja portal](https://developer.safaricom.co.ke).
3. **Test connection.** When the test passes, that company's STK Push switches
   from the simulator to real M-Pesa immediately.
4. Optional: **Register Paybill URLs** so payments typed into the Paybill menu
   on a phone are confirmed automatically too.

Until step 3 passes, payments keep working in the built-in simulator (clearly
labelled). In sandbox with live keys, the Paybill simulator on the payments page
sends real test payments through Safaricom. Callback URLs carry an unguessable
per-company token (Daraja doesn't sign callbacks) and avoid the words Safaricom
rejects in registered URLs, so they live under `/api/pay/…`. Posting a payment
is idempotent on the M-Pesa receipt, so Safaricom's retries never double-credit.
If a callback can't reach the server, pending STK requests are checked with
Daraja's STK query.

**Other integrations (platform admin):**

| Setting | Provider | What it does |
| --- | --- | --- |
| SMS | Africa's Talking | Receipts, reminders, sign-in codes, care replies, missed-pickup notices. Until connected, messages are recorded in the outbox (Settings → Activity) but not sent. |
| USSD | Africa's Talking | `*384*…#` menu: balance, pay (STK Push to the phone that dialled), next collection, report missed pickup, book a pickup, switch to Kiswahili. Point the service's callback at the URL shown in Settings. There's an in-app tester. |
| Email | Resend | Password resets and staff invitations. |
| Translation | Anthropic Claude | Chat translation between English, Kiswahili and Sheng. |

Once SMS or email is connected, **Text me a test** / **Email me a test** sends a
real message to the admin's own phone or inbox: *Test connection* proves the
keys sign in, this proves a message arrives.

### Pilot checklist: proving the integrations

The request and callback formats are covered by contract tests
(`tests/integrations.test.ts`, against the payloads in each provider's
documentation), but only real traffic proves a deployment. With one pilot
company, before taking real money:

1. **Daraja sandbox.** Enter the sandbox keys, *Test connection*, *Register
   Paybill URLs*. On Payments, run the Paybill simulator: Safaricom's sandbox
   calls back and the payment appears against the client. Start an STK prompt
   to a sandbox test number and approve it.
2. **SMS.** Connect Africa's Talking (sandbox first, using their simulator
   app), *Text me a test*, then trigger a receipt and a sign-in code and check
   Settings → Activity shows them *sent*.
3. **Email.** Verify the sending domain in Resend, *Email me a test*, then send
   a password reset to yourself.
4. **Production keys.** Swap the Daraja environment to production with the
   company's own short code and keys, *Test connection*, *Register Paybill
   URLs*, and pay KES 10 from a real phone by Paybill and by STK. Check the
   receipt SMS, the statement and the M-Pesa payments page, and reverse it in
   the company's books if it was only a test.

## Photos, monitoring and backups

- **Photos** (proofs of collection, dumping reports, logos) go to
  [Vercel Blob](https://vercel.com/docs/vercel-blob) as private files once a
  Blob store is connected to the project (Storage → Blob sets
  `BLOB_READ_WRITE_TOKEN`). They're only ever served through `/api/files/…`,
  after the same access check as before. Without a store they stay in the
  database, and the nightly job moves any left there across once one is
  connected.
- **Errors** go to [Sentry](https://sentry.io) when `SENTRY_DSN` (server) and
  `NEXT_PUBLIC_SENTRY_DSN` (browser) are set: every unhandled error in a page,
  API route, cron job or callback, with no cookies, headers, bodies or query
  data attached. Set alerts in Sentry.
- **Uptime:** point a monitor (Better Stack, UptimeRobot) at `/api/health`,
  which answers 200 while the database is reachable and 503 when it isn't.
- **Backups:** Neon keeps point-in-time history; restore from its console to
  any moment in the retention window. On top of that, the nightly job
  (`/api/cron/maintenance`, 02:30 Nairobi) exports every table, encrypts it
  with `BACKUP_ENCRYPTION_KEY` and keeps the last 14 in Blob. They're listed
  under Admin → Settings → Backups, with *Back up now* and download. To
  restore one into a fresh database (a new Neon branch is ideal):

  ```bash
  BACKUP_ENCRYPTION_KEY=... DATABASE_URL=postgres://... node scripts/restore.mjs zoa-2026-09-26.bak --yes
  ```

  Keep the key somewhere other than Vercel (a password manager): a backup
  without its key can't be read, which is the point.

## Scheduled billing

`POST /api/cron/billing` with `Authorization: Bearer $CRON_SECRET` raises the
month's collection fee for every client (idempotent) and sends due reminders for
companies that turned them on. Call it daily from any scheduler. Reminders
escalate at most one stage per run and each stage goes out at most once a month:
an SMS, then an M-Pesa prompt for the balance, then a service warning — the day
thresholds are set per company. Company admins can preview and send them by hand
under **Arrears & reminders**.

## Customer care: Sheng, Kiswahili, English

`src/lib/sheng.ts` is a curated glossary of Nairobi Sheng and the everyday
Kiswahili of waste-collection complaints. It's used two ways:

- **Always**, with no key: slang in a message is highlighted and its meaning
  shown under the message.
- **With the Anthropic key**: a full translation, grounded on the glossary, which
  flags anything ambiguous instead of guessing. Agents can also rewrite a draft
  reply in Kiswahili or Sheng before sending.

Translations use the official Anthropic SDK (`claude-opus-5` by default,
selectable in Settings), structured output, and server-side refusal fallbacks
(`fallbacks: "default"`). They're cached on the message, so each is paid for once.

The interface itself has a Kiswahili toggle (EN/SW in the top bar), saved per
account; client-facing screens and navigation are translated (`src/lib/i18n.tsx`).

## Offline collector app

The app is installable (web app manifest). A service worker keeps the
collector screens and app code available offline; marking stops (with proof
photos), undo, location updates, vehicle checks, fuel and incident reports are
queued in IndexedDB and sent when the
connection returns, with a banner showing what's waiting. Signing out clears the
page cache. Real phone GPS is opt-in per device (My location → "Use this phone's
GPS"); otherwise trucks move along a simulated route.

## Fleet management

Company admins get **Fleet management** (`fleet.manage`); drivers get **My truck**
(`fleet.inspect`). Everything runs on the collector's phone and the office — no
tracker hardware.

- **Tracking and trips.** Every GPS fix from the collector app is kept
  (`gps_pings`) and folded into the truck's day by `lib/telemetry.ts`: distance,
  driving and idle time, speeding, movement outside working hours, and arrivals
  at the yard, the Dandora dumpsite and service estates (geofences in
  `lib/fleet.ts`). Trips replay on a map with a timeline.
- **Daily vehicle check.** A ten-item walk-round for compactors and tippers. A
  defect opens a work order; a safety-critical one (brakes, tyres, leaks,
  hydraulics) takes the truck off the road until the workshop closes it.
- **Maintenance.** Service every N km or days, whichever first; work orders from
  open to done with parts, labour and garage. Finishing a service restarts the
  schedule.
- **Fuel.** Fills with litres, amount, odometer and M-Pesa code. Efficiency is
  worked out fill to fill; a fill far below the truck's expected km/L, or bigger
  than its tank, is flagged.
- **Compliance.** Insurance, NTSA inspection, NEMA waste transport licence and
  county permit per truck; driving licence and good conduct per driver. Flagged
  30 days before expiry. Incidents (accidents, breakdowns, theft, spills, fines).
- **Drivers.** Scorecards out of 100 from speeding and idling per 100 km,
  after-hours movement, skipped checks and incidents; trucks assigned (and
  swapped) from the same screen.
- **Costs.** Fuel, finished work orders and renewed papers post themselves to
  the books (5000 Fuel, 5200 Vehicle maintenance, 5600 Licences & permits) as
  source "Fleet", like billing does — nothing is typed twice. The overview shows
  cost per km, cost per tonne collected and CO₂ from fuel burned.

Alerts (papers, services, defects, fuel, driving, missing checks) are worked out
from the records on demand and appear in the notification bell. Speed limit,
idle time, working hours and the fuel threshold are per company, under the rules
button on the fleet page.

Left out on purpose: features that need hardware on the truck (OBD-II
diagnostics, tyre pressure, dashcams, remote immobilisation, cargo sensors) and
US-only compliance (ELD/hours of service, IFTA). The GPS pipeline takes fixes
from anywhere, so a hardware tracker can feed `recordPing` later.

## Staff & departments

A company admin runs their own team under **Staff & departments**
(`staff.manage`), without the platform admin.

- **Departments** (Customer care, Finance & billing, Operations, Fleet &
  workshop to start) each carry a set of permissions, ticked from a checklist.
  Everyone in a department can do what it allows; a change applies on their
  next click, because permissions are resolved on every request.
- **Staff** are invited into a department by email (or a link to pass on when
  email isn't connected) and hold the *Company staff* role, which carries
  nothing itself. Per person, the admin can add a permission or take one of the
  department's away; a removal always wins. Suspending signs them out.
- **What can be delegated** is the company's own work only
  (`COMPANY_ASSIGNABLE` in `lib/auth/permissions.ts`), capped at what the admin
  holds — never platform, access-control, client or driver permissions.
  Company admins and drivers are listed but managed elsewhere.
- **My dashboard** (`/company/desk`) is each staff member's home: the queues
  their permissions cover — clients waiting on care, payments to match,
  arrears, pickups to schedule, dumping reports, fleet alerts — with links to
  the full pages. Staff land there after signing in; company admins land on the
  company dashboard.

## Customer care, invoices and the audit trail

- **Chat agent** is the live conversation with clients. **Tickets** is the same
  desk as a ticketing system: every request has a priority that sets its
  deadline (urgent 4 h, high 8 h, normal 24 h, low 3 days), an owner, a channel
  (app, phone, walk-in, USSD, crew, email), internal notes the client never
  sees, and a history of status, priority and owner changes. Queues: open,
  mine, unassigned, overdue, resolved. Staff can open a ticket for a caller or
  walk-in (the client gets an SMS with the number); an unassigned ticket goes to
  whoever replies first.
- **Invoices** (under Financial reports) are the charges on each account —
  monthly fees and on-demand pickups — with payments applied oldest first, due
  10 days after issue. Each prints as a document with the Paybill details, and
  can be sent to the client by SMS.
- **Audit log** entries carry the IP address the request came from (the first
  hop of `X-Forwarded-For` behind Vercel or another proxy), and staff sign-ins
  are logged. Search works on IPs too.

## Two-step sign-in

Everyone has a **Security** page (user menu → Security) where they turn on a
second step after their password:

- **Passkey** — fingerprint, face or screen lock (WebAuthn, via
  `@simplewebauthn`). Passkeys are tied to the site's domain.
- **Authenticator app** — standard 6-digit TOTP codes (Google/Microsoft
  Authenticator and the like), set up from a QR code.
- **SMS code** and **email code** — the phone or email is verified with a code
  first.

Turning on the first method gives ten one-time **recovery codes**. At sign-in
the person picks any method they have, and can tick "remember this device".

The platform admin sets the rules per kind of account — clients, collectors,
company admins & staff, platform admins — under **Settings → Sign-in security**:
two-step off, optional or required; which methods are offered; how long a device
is remembered. *Required* holds people on their Security page (no data, no
actions) until they set a method up. A platform admin can reset someone's
methods from **Users** if they're locked out.

Five wrong codes end a sign-in attempt. The count is kept per server instance,
so on a multi-instance deployment it is a speed bump rather than a hard limit.

## Security model

- **Sessions** are HS256 JWTs in an httpOnly, SameSite=Lax cookie; passwords are
  scrypt-hashed. `SESSION_SECRET` is required in production.
- **Every write is checked on the server.** The app sends commands to
  `/api/commands`; `src/server/commands.ts` checks the permission *and* the scope
  (a client only their account, a collector only their truck, a company only its
  own data) before touching the database. UI checks are a convenience only.
- **Reads are scoped too.** `/api/state` returns only the session's slice: a
  client never receives other clients' data, and staff receive only what their
  permissions cover (the workshop gets no phone numbers, balances or care
  conversations). Each poll sends the version it holds; database triggers keep
  a change counter per company and client, so an unchanged poll is answered
  with an empty 304 instead of rebuilding the snapshot, and quiet tabs poll
  less often.
- **Ids can't collide.** Ticket, pickup, work-order and client numbers come
  from counters taken in one atomic statement.
- **Permissions, not roles, are checked.** A role bundles `resource.action`
  permissions; users can have personal grants and denies (deny wins). Managed at
  `/admin/access` and `/admin/users`, where staff can also be invited by email.
- **Account flows**: password reset by SMS or email code, SMS-code sign-in and
  invitation links. Codes are 6 digits, stored as an HMAC, expire in 15 minutes
  and lock after 5 attempts; responses never reveal whether an account exists.
  When SMS/email aren't connected, the code is shown on screen outside
  production only (demo convenience).
- **Rate limits** are counted in the database, so every server instance shares
  them: 8 wrong passwords or codes per account and 40 per IP address in 15
  minutes, 5 codes sent per phone or email (20 per IP) an hour, and 6 wrong
  second-step answers in 10 minutes.
- **Audit log** at `/admin/audit` and `/company/audit`.

## How it is put together

```
src/
  middleware.ts          Edge route gate: verify token, check workspace
  app/
    (authed)/            Everything behind a session; the layout loads the snapshot
    login/               Sign in, reset password, SMS code, accept invitation
    api/
      state/             The session's data snapshot
      commands/          Every write, permission- and scope-checked
      pay/               Safaricom callbacks (STK, C2B) and STK status
      settings/          Integration settings, tests, outbox
      ussd/              Africa's Talking callback and the in-app tester
      translate/         Chat translation
      reminders/ cron/   Arrears preview/run, scheduled billing
      files/             Photo upload and download
      auth/ admin/       Sessions, account flows, roles, users, invites
  server/                Server-only
    db/                  Drizzle schema, connection (Postgres or PGlite), seed
    commands.ts          Applies commands
    snapshot.ts          Builds the scoped snapshot
    payments.ts          M-Pesa, live and simulated
    billing.ts           Monthly charges and reminders
    ussd.ts              USSD menu
    settings.ts crypto.ts  Encrypted integration settings
    integrations/        Daraja, Africa's Talking + Resend, Claude translation
    authFlows.ts         Resets, SMS codes, invitations
  lib/                   Shared domain code: types, selectors, analytics,
                         Sheng glossary, i18n, route optimiser, integrations catalogue
  store/                 Client store: snapshot + UI state, commands, offline queue
  features/              One component per screen
  components/            Layout, charts, map, M-Pesa, support, collector, UI
  styles/                tokens · base · components · map · auth · features · responsive
public/sw.js             Offline support
```

### Visual language

An environmental palette: a deep forest-teal rail, mint-white canvas,
borderless white cards separated by soft green-tinted shadow, a vivid leaf-green
primary with dark text, and coral for alerts and counts. Charts use a validated
accent/context pair in both themes, thin marks, hover/focus tooltips and a table
view for every chart. All colour is token-driven in `src/styles/tokens.css`.

### The map

Leaflet over OpenStreetMap tiles (no key). Dark mode recolours the tiles in CSS.
OSM's [tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
covers development and light traffic; a real deployment should self-host tiles
or use a paid provider.
