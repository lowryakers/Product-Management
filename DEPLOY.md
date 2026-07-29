# Deploying to Railway

Start to finish, about 20 minutes. You need a Railway account and the GitHub
repo connected.

Anywhere below that says *run a command*, use Railway's shell: open your service
→ the **⋮** menu top-right → **Terminal**. Everything else is clicking.

---

## 1. Create the project

1. Go to **railway.app** → **New Project**
2. **Deploy from GitHub repo** → pick `lowryakers/Product-Management`
3. When it asks for a branch, choose `claude/prodough-product-management-worndg`

Railway will immediately try to build and **it will fail.** That's expected —
it's looking at the repo root and the app lives in a subfolder. Next step fixes it.

---

## 2. Point it at the app folder

This is the step people miss.

1. Click the service → **Settings**
2. Find **Root Directory** (under Source)
3. Set it to `app`
4. Save

---

## 3. Add the database

1. In the project canvas, click **+ New** → **Database** → **Add PostgreSQL**
2. Nothing else to configure

Railway wires `DATABASE_URL` into your service automatically. Don't set it by hand.

---

## 4. Set the environment variables

Service → **Variables** → **Raw Editor**, then paste this and edit the values:

```
SESSION_SECRET=paste-a-long-random-string-here
APP_TZ=America/Denver
NUDGE_HOUR=8
SEED_OWNER_EMAIL=lowry@powder-ops.com
SEED_OWNER_NAME=Lowry Akers
```

For `SESSION_SECRET`, use any long random string — Railway's Terminal can make
one:

```bash
openssl rand -base64 48
```

Changing it later signs everyone out, so set it once and leave it.

---

## 5. Get your URL

1. Service → **Settings** → **Networking** → **Generate Domain**
2. You'll get something like `prodough-pm-production.up.railway.app`
3. Go back to **Variables** and add it:

```
PUBLIC_URL=https://prodough-pm-production.up.railway.app
```

No trailing slash. Railway redeploys automatically.

Once it's green, check `https://your-url/healthz` — you should see
`{"ok":true,...}`.

---

## 6. Turn on notifications

In Railway's **Terminal**:

```bash
npm run vapid
```

It prints two keys. Copy both into **Variables**:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:lowry@powder-ops.com
```

Generate these **once**. Regenerating them unsubscribes every device.

---

## 7. Load your data

Migrations run automatically on every deploy. The data load is manual and
one-time. In the **Terminal**:

```bash
npm run seed
```

You'll see:

```
  owner            lowry@powder-ops.com
  ┌───────────────────────────────────────────────
  │  TEMPORARY PASSWORD:  <copy this>
  └───────────────────────────────────────────────
  products         118
  PO 42826   38 lines · $141,830.64  (4 excluded)
  PO 41726   37 lines · $47,058.00
  PO 43026   11 lines · $6,510.00  (4 excluded)
```

**Copy the temporary password before you close the terminal.** If you lose it,
just run `npm run seed` again — it's safe to re-run and will print a new one.

To add your assistant at the same time, set these first, then re-run the seed:

```
SEED_STAFF_EMAIL=assistant@powder-ops.com
SEED_STAFF_NAME=Marnee
```

Leave the password variable out and one gets generated and printed. You can also
just add them later from **Settings → People** inside the app, which is easier.

---

## 8. Sign in and lock it down

1. Open your URL, sign in with your email and the temporary password
2. Go to **Settings** → change your password
3. Delete `SEED_OWNER_PASSWORD` / `SEED_STAFF_PASSWORD` from Railway Variables if
   you set them

---

## 9. Put it on your phone

**iPhone (Safari — this only works in Safari, not Chrome):**

1. Open your Railway URL in Safari
2. Tap the **Share** button (square with the up arrow)
3. Scroll down → **Add to Home Screen**
4. Name it something short — "ProDough" or just "PD"
5. Tap **Add**

Now open it **from the home screen icon**, not from Safari. It runs fullscreen
with no address bar, like a real app.

**Android (Chrome):** menu → **Install app**.

---

## 10. Enable push, upload the logo

Both from inside the app, once it's on your home screen:

- **Settings → Notifications → Enable on this device**, then **Send test**.
  On iPhone this only works when opened from the home screen icon — iOS blocks
  notifications from a Safari tab. If nothing arrives, check
  iOS Settings → Notifications → ProDough.
- **Settings → PO logo → Upload.** Drop in the ProDough ® wordmark PNG. Every
  generated PO picks it up immediately — no redeploy.

Verify it worked: **Orders → PO 43026 → Download PDF.** The logo should be in the
header, and the total should read **$6,510.00** with the four pancake lines struck
through and marked excluded — not the $23,870 the old spreadsheet showed.

---

## Cost

One service plus one Postgres on Railway's Hobby plan runs roughly $5–10/month at
this size. The app idles at low memory and the database is tiny — 118 products,
86 PO lines.

---

## Redeploying

Push to the branch and Railway rebuilds automatically. Migrations apply on boot
via `prisma migrate deploy`. You do **not** need to re-run the seed — it's only
for the initial load.

If you change the CSVs in `data/`, run `python3 scripts/build_dataset.py` locally
(it writes to both `data/` and `app/data/`), commit, push, then re-run
`npm run seed` in Railway's terminal.

---

## When something breaks

**Build fails immediately** — Root Directory isn't set to `app`. Step 2.

**"Missing required env var: SESSION_SECRET"** — Step 4.

**App loads but every page 500s** — the Postgres service isn't attached. In the
canvas, the database should be linked to the service; if not, service →
Variables → **Add Reference** → your Postgres → `DATABASE_URL`.

**Push notifications do nothing on iPhone** — you're opening it from a Safari
tab. It has to be launched from the home screen icon. iOS 16.4 or newer.

**Logo doesn't appear on the PDF** — it needs to be PNG or JPEG. SVG isn't
supported by the PDF renderer; export a PNG at roughly 800px wide with a
transparent background.

**Logs** — service → **Deployments** → click the active one → **View Logs**.
