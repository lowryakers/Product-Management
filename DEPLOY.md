# Deploying to Railway

About 15 minutes, almost entirely clicking. You need a Railway account and your
GitHub connected.

The app sets itself up on first boot — it generates its own security keys and
loads your 118 SKUs automatically. **You never need a terminal.**

---

## Before you start

In GitHub, set the default branch to `main`:
**repo → Settings → General → Default branch → switch to `main`**.

Railway pre-selects whatever GitHub says is the default, so doing this first
avoids deploying the wrong branch by accident.

---

## 1. Create the project

1. Go to **railway.app** and sign in
2. Click **New Project**
3. Choose **Deploy from GitHub repo**
4. Pick `lowryakers/Product-Management`
5. Branch: **`main`**

Railway starts building. It may fail on this first attempt because there is no
database yet — that is fine, keep going.

---

## 2. Root Directory — nothing to do

Earlier versions of this guide told you to set **Root Directory** to `app`. You
no longer need to. The repo carries a Dockerfile at both the root and in `app/`,
so the build works whether that setting is empty or set to `app`.

If you already set it to `app`, leave it. If it is empty, leave it. Either is
correct.

---

## 3. Add the database

### 3a. Create it

1. Go back to the project canvas (click the project name, top left)
2. Click **+ Create** (top right) — some versions read **+ New**
3. Choose **Database**
4. Choose **Add PostgreSQL**

A second card appears, usually named **Postgres**. Note the exact name — you
need it in a moment.

### 3b. Connect it to your app — do not skip this

Adding a database does *not* automatically hand your app the connection string.
You have to point at it.

1. Click your **app** service (not the Postgres card)
2. **Variables** tab
3. Look for `DATABASE_URL` in the list

**If `DATABASE_URL` is already there**, you are done — go to step 4.

**If it is not:**

1. Click **+ New Variable**
2. Name: `DATABASE_URL`
3. Value — click **Add Reference** and pick Postgres → `DATABASE_URL`, or type
   it by hand:
   ```
   ${{Postgres.DATABASE_URL}}
   ```
4. Click **Add**

If your Postgres card is named something other than `Postgres`, use that exact
name inside the braces — e.g. `${{Postgres-Prod.DATABASE_URL}}`.

This is the most common thing to get wrong. If the app boots and every page
500s, come back here.

---

## 4. Set two variables

Still on your app service → **Variables** tab.

Click **Raw Editor**, then add these lines (leave `DATABASE_URL` alone — do not
paste over it):

```
APP_TZ=America/Denver
NUDGE_HOUR=8
```

That is genuinely all that is required. `NUDGE_HOUR=8` means the daily triage
reminder fires at 8am Mountain.

**Optional — add Marnee now.** With these two, her account is created on first
boot and her temporary password prints alongside yours:

```
SEED_STAFF_EMAIL=marnee@powder-ops.com
SEED_STAFF_NAME=Marnee Dortch
```

You can also add her later inside the app under **Settings → People**, which is
easier. Either is fine.

**What you do NOT need to set:** `SESSION_SECRET`, `VAPID_PUBLIC_KEY`,
`VAPID_PRIVATE_KEY`. The app generates all three on first boot and stores them
in the database, so they survive every future deploy. Setting them by hand still
works, but there is no reason to.

Click **Update Variables**. Railway redeploys.

---

## 5. Give it a web address

1. App service → **Settings** tab
2. Scroll to **Networking**
3. Under **Public Networking**, click **Generate Domain**
4. If it asks for a port, enter `3000`
5. You get something like `product-management-production.up.railway.app`

Copy that URL. Go back to **Variables** → **Raw Editor** and add one line — your
actual URL, with `https://` and **no** trailing slash:

```
PUBLIC_URL=https://product-management-production.up.railway.app
```

Click **Update Variables**. Railway redeploys one last time.

**Check it worked:** open `https://your-url/healthz` in a browser. You should
see `{"ok":true,"ts":"..."}`. If you do, the app and database are talking.

---

## 6. Get your password from the deploy log

This is where the app sets itself up. You just read the result.

1. App service → **Deployments** tab
2. Click the deployment at the top (the active one)
3. Click **View Logs**, or the **Deploy Logs** tab

Scroll until you find this:

```
  Generated and stored a session secret.
  Generated and stored a VAPID key pair — push is ready to enable.

  No users found — first boot. Loading the catalog…

  Seeding ProDough PM…
    owner            lowry@powder-ops.com
    products         118
    PO 42826   38 lines · $141,830.64  (4 excluded)
    PO 41726   37 lines · $47,058.00
    PO 43026   11 lines · $6,510.00  (4 excluded)

  ┌──────────────────────────────────────────────────────────
  │  SIGN IN WITH
  │    lowry@powder-ops.com
  │    0enwWmsBg1C_          ← your password; yours will differ
  │
  │  Change it under Settings once you are in.
  └──────────────────────────────────────────────────────────
```

**Copy that password.** The log stays in Railway, so you can come back for it.

*If you do not see the seeding block*, the database already had data — the seed
only runs when it is completely empty. That is the safety catch that stops a
redeploy from wiping or duplicating anything.

*If you see a crash instead*, jump to troubleshooting at the bottom.

---

## 7. Sign in

1. Open your Railway URL
2. Email `lowry@powder-ops.com`, password from the log
3. Tap the circle with your initials (top right) → **Settings**
4. **Change your password** — 10+ characters

You should see 118 SKUs under **SKUs** and three purchase orders under
**Orders**.

---

## 8. Put it on your phone

**iPhone — must be Safari, not Chrome:**

1. Open your Railway URL in **Safari**
2. Tap **Share** (square with an arrow pointing up)
3. Scroll down → **Add to Home Screen**
4. Name it something short — "ProDough" or "PD"
5. Tap **Add**

Open it **from the home screen icon** from now on. It runs fullscreen with no
address bar. This matters: notifications only work when launched that way.

**Android — Chrome:** menu (⋮) → **Install app**.

---

## 9. Notifications and your logo

Both from inside the app, opened from the home screen icon.

**Notifications:** Settings → **Enable on this device** → allow when iOS asks →
**Send test**. A notification should arrive in a second or two. If not, check
iOS **Settings → Notifications → ProDough**. Needs iOS 16.4+.

**Logo:** Settings → **PO logo** → **Upload**. ProDough ® wordmark as a **PNG**,
roughly 800px wide, transparent background. SVG will not work — the PDF engine
cannot read it. Every PO picks it up immediately, no redeploy.

---

## 10. Confirm it all works

**Orders → PO 43026 → Download PDF.**

You should see:

- Your logo top-left
- Total **$6,510.00**
- Four pancake lines struck through, marked *EXCLUDED — leaving off this PO*
- Footer reading `SKUs: 7`

If that PDF is right, the whole chain works — catalog, specs, exclusion logic,
PDF rendering, logo. The old spreadsheet said $23,870 for that same PO.

---

## Cost

One app service plus one Postgres runs roughly **$5–10/month** on Railway's
Hobby plan. The database is tiny — 118 products, 86 PO lines, a few hundred
colour rows.

---

## Redeploying later

Push to `main` and Railway rebuilds automatically. Migrations apply on boot.

**Nothing re-seeds and no keys rotate** — the seed only runs against an empty
database, and the secrets persist in Postgres. You stay signed in across
deploys.

If you change the CSVs in `data/`, run `python3 scripts/build_dataset.py`
locally (it writes both `data/` and `app/data/`), commit and push. Reloading
that data into an existing database needs `npm run seed`, which does want a
terminal — ask me and I will add an in-app reload button instead.

---

## When something breaks

**Build fails in a few seconds, "Failed to build an image"** — open **Build
Logs** (not Deploy Logs) and read the first red line. The build now uses a
Dockerfile, so this should be rare. Send me the log and I will read it.

**Every page 500s, or logs say "Can't reach database server"** — `DATABASE_URL`
is not wired up. Step 3b. Check the reference name matches your Postgres card's
exact name.

**"Missing required env var: DATABASE_URL"** — same thing, step 3b.

**App restarts over and over** — open the log and read the first error line.
Nine times out of ten it is the database reference.

**Health check fails but the app looks fine** — Railway may be probing the wrong
port. Settings → Networking → make sure the domain targets port `3000`.

**Push does nothing on iPhone** — you are opening it from a Safari tab instead
of the home screen icon. iOS blocks notifications from tabs.

**Logo missing from the PDF** — must be PNG or JPEG, not SVG.

**Where the logs are** — service → **Deployments** → click the active
deployment → **View Logs**. Paste anything confusing to me and I will read it.
