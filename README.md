# Zoa Waste Hub

A platform for Nairobi waste collection: client accounts and M-Pesa billing,
live fleet tracking, collector route sheets with proof of collection, customer
care with Sheng/Kiswahili translation, on-demand pickups, dumping reports,
recycling tracking and USSD for clients without smartphones.

| Role | What it covers |
| --- | --- |
| **Client** | Account card, balance, pay by M-Pesa, statement, live truck tracking, book bulky/extra pickups, report illegal dumping, recycling figures, care chat |
| **Company** | Dashboard and trends, client register, fleet map, M-Pesa payments and suspense, arrears and reminders, statements, pickup requests, dumping reports, recycling, care inbox, settings, audit log |
| **Collector** | Today's route (optimised order), proof of collection (photo, GPS, weight, waste type), on-demand jobs, GPS sharing — works offline |
| **Admin** | City overview and trends, all clients, all fleets, dumping reports, roles and users (with invitations), platform settings, audit log |

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
npm run typecheck
```

With no configuration the app runs on a local embedded database (below) with
demo data, and payments/SMS run in simulated mode. Sign in with any account on
the sign-in page; they all use the password `zoa12345`.

| Account | Role | Lands on |
| --- | --- | --- |
| `wanjiku@example.com` | Client | `/client` |
| `john.kiprop@takasafi.co.ke` | Collector | `/collector` |
| `care@takasafi.co.ke` | Care agent | `/company` |
| `ops@takasafi.co.ke` | Company admin | `/company` |
| `admin@zoahub.co.ke` | Platform admin | `/admin` |

## Database

PostgreSQL through [Drizzle ORM](https://orm.drizzle.team). Schema in
`src/server/db/schema.ts`, migrations in `drizzle/`, applied automatically on
start; an empty database is seeded with the demo world.

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
photos), undo and location updates are queued in IndexedDB and sent when the
connection returns, with a banner showing what's waiting. Signing out clears the
page cache. Real phone GPS is opt-in per device (My location → "Use this phone's
GPS"); otherwise trucks move along a simulated route.

## Security model

- **Sessions** are HS256 JWTs in an httpOnly, SameSite=Lax cookie; passwords are
  scrypt-hashed. `SESSION_SECRET` is required in production.
- **Every write is checked on the server.** The app sends commands to
  `/api/commands`; `src/server/commands.ts` checks the permission *and* the scope
  (a client only their account, a collector only their truck, a company only its
  own data) before touching the database. UI checks are a convenience only.
- **Reads are scoped too.** `/api/state` returns only the session's slice: a
  client never receives other clients' data.
- **Permissions, not roles, are checked.** A role bundles `resource.action`
  permissions; users can have personal grants and denies (deny wins). Managed at
  `/admin/access` and `/admin/users`, where staff can also be invited by email.
- **Account flows**: password reset by SMS or email code, SMS-code sign-in and
  invitation links. Codes are 6 digits, stored as an HMAC, expire in 15 minutes
  and lock after 5 attempts; responses never reveal whether an account exists.
  When SMS/email aren't connected, the code is shown on screen outside
  production only (demo convenience).
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
