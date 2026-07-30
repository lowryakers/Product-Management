# ProDough PM — the app

A small, boring, self-hosted product management app. Node + TypeScript + Fastify
+ Postgres, server-rendered, installable as a phone app.

Deploy steps are in [`../DEPLOY.md`](../DEPLOY.md).

---

## Why this stack

Deliberately unfashionable. Eight dependencies, no build step beyond `tsc`, no
frontend framework. The point is that in a year, when something breaks, you can
hand the whole thing to Claude Code and it fits in one context window.

- **Fastify** — HTTP
- **Prisma + Postgres** — data, migrations, typed queries
- **pdfkit** — purchase order PDFs
- **web-push** — notifications, no third-party service
- Passwords via node's built-in `scrypt`; no bcrypt to keep current
- HTML via tagged template literals; no templating engine

---

## Local development

```bash
cp .env.example .env      # fill in DATABASE_URL and SESSION_SECRET
npm install
npx prisma migrate dev
npm run seed
npm run dev               # http://localhost:3000
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Watch mode |
| `npm run build` | Prisma client + TypeScript compile |
| `npm start` | Applies migrations, then serves — this is what Railway runs |
| `npm run seed` | Loads `data/*.csv`. Safe to re-run. |
| `npm run vapid` | Prints a VAPID key pair for push |
| `npm run icons` | Regenerates the PWA icon set |
| `npm run typecheck` | Types only, no emit |

---

## Layout

```
prisma/schema.prisma   the data model — start here
prisma/seed.ts         CSV import, idempotent
src/server.ts          wiring
src/auth.ts            sessions, login, role checks
src/routes/            inbox · products · pos · push · settings
src/lib/po-pdf.ts      purchase order rendering
src/scheduler.ts       daily nudge, Monday digest, late-vendor check
src/views/layout.ts    page shell and nav
public/                CSS, service worker, manifest, icons
data/                  deployed copy of the CSVs (see note below)
```

`data/` is a copy of the repo-root `data/` folder. Railway builds with `app/` as
its root directory, so the app needs its own copy. `scripts/build_dataset.py`
writes both — don't edit `app/data/` by hand.

---

## The catalog explorer

`/products` is the ad-hoc view engine — the Airtable-like part. The entire view
state (search, filters, sort, grouping, visible columns) lives in the
querystring, which means every view is bookmarkable and shareable, and a
**saved view is just a stored querystring** — no extra machinery.

- **11 condition filters** — no usable spec, GTIN invalid, no colours, invalid
  hex, stick with no eyemark, has open changes, on order, never ordered, needs
  review, no artwork. Multiple filters intersect.
- **Facet filters** on product line, format, status, spec, with live counts
- **Sort** on any sortable column, **group** by line/format/status/spec/flavour
- **Column picker** — 18 available, 6 shown by default
- **CSV export** of exactly what is on screen
- **Saved views** per user, surfaced as chips at the top

Adding a filter is one entry in `FLAGS` in `src/lib/query.ts` — a label and a
Prisma `where` fragment. Adding a column is one entry in `COLUMNS`.

One subtlety worth preserving: `missing_spec` tests for *no usable* spec, not
`specId IS NULL`. `SPEC-BOX-DONUT` and `SPEC-CUP-OAT` exist as deliberate
placeholders so the 29-SKU gap stays visible, so a null test reports 2 when the
real answer is 31.

## Three behaviours worth knowing

**Excluded PO lines.** `POLine.excluded` keeps a line visible while removing its
money from every total and from the PDF. This is the structural fix for the
$24,850 the old spreadsheets were overstating — a note in a cell was a message to
a human; a checkbox the sum respects is a control.

**Offline capture.** If you submit the capture form with no signal, it's stored
in `localStorage` with a generated `clientId` and replayed against
`POST /api/capture` when you're back online. `InboxItem.clientId` is unique, so a
double-replay is a no-op rather than a duplicate. The note textarea also
autosaves as you type.

**PO numbers.** MMDDYY, matching the convention already in use (`42826` =
2026-04-28), assigned once at send time by `POST /pos/:id/send` and never typed.
Same-day collisions get a letter suffix.

---

## Adding a route

1. Add the model to `prisma/schema.prisma`, run `npx prisma migrate dev`
2. Create `src/routes/thing.ts` exporting `registerThingRoutes(app)`
3. Register it in `src/server.ts`
4. Add a tab in `src/views/layout.ts` if it needs one

Every handler starts with `requireUser(req, reply)` and returns early if null.

---

## Not built yet

Phase 2, in the order I'd do them:

- **Artwork versions** — schema exists, no UI. Google Drive links paste in
  manually for now; a service-account sync that walks Shaun's folder and matches
  filenames to SKUs comes after.
- **NFP approval by link** — schema exists (`NfpVersion.approvalToken`). The flow
  is: Matt drafts, you generate a signed link, you text it to Danny, he approves
  on a page with no login. Then artwork can't reach `PRINT_READY` unless its NFP
  is `APPROVED`.
- **RFQ and quote history** — schema exists. Price attaches to the spec at a
  volume tier, because that's how Mike actually quotes (every stick film line on
  PO 42826 is $0.0749). Scoring a new quote against history is the point.
- **Vendor timing** — fields exist on `POLine` (`quotedLeadTimeDays`,
  `promisedDate`, `actualReceiptDate`) plus `PromiseLogEntry` for every date
  change. Needs the scorecard view.
- **PO builder UI** — currently POs are imported, not created in-app.
