# Deploying shadow-kpi

This guide walks you from "it runs on my laptop" to "we used it at standup today" in about an hour. We'll use:

- **Vercel** for hosting (zero-config for Next.js, free hobby tier, native cron support)
- **Neon** for Postgres (free serverless tier, branching, fast cold starts)
- **Resend** for transactional email (you already have an account)
- **A domain you own** (for Resend domain verification + nicer URL)

If you'd rather use a different Postgres host (Vercel Postgres, Supabase, your own RDS), skip Step 2 and supply your own `DATABASE_URL` later.

---

## Step 1 — Generate the two secrets

You need two random hex strings.

```bash
openssl rand -hex 32   # → use for AUTH_SECRET
openssl rand -hex 32   # → use for CRON_SECRET
```

Save them somewhere — your password manager, or just keep this terminal open for the next 15 minutes.

---

## Step 2 — Create the production database (Neon)

1. Sign in at <https://console.neon.tech> (GitHub OAuth is fastest)
2. Click **Create a project**
   - Name: `shadow-kpi`
   - Postgres version: latest
   - Region: closest to your team
3. After it provisions, copy the **pooled connection string** from the dashboard (looks like `postgresql://...neon.tech/...?sslmode=require`)
4. Apply the schema:

   ```bash
   DATABASE_URL="<pooled-connection-string>" npm run db:migrate
   ```

   You should see `Migrations applied.`

---

## Step 3 — Verify your domain at Resend

This is the step that unblocks "magic links to anyone, not just `ballance@gmail.com`."

We're using **`mail.bastionforge.com`** as the send-from domain — a dedicated subdomain isolates the SPF/DKIM/DMARC records from anything else you might use the root for.

1. Go to <https://resend.com/domains>
2. **Add Domain** → enter `mail.bastionforge.com`
3. Resend gives you 3–4 DNS records. Add them at your registrar (the host column shows where each record goes relative to `bastionforge.com`):
   - SPF: `TXT mail "v=spf1 include:_spf.resend.com ~all"`
   - DKIM: `TXT resend._domainkey.mail "p=<long-key-string>"`
   - DMARC: `TXT _dmarc.mail "v=DMARC1; p=none;"`
4. Wait for "Verified" in the Resend dashboard (usually <10 min after DNS propagates)
5. The `from` address you'll use everywhere is: `shadow-kpi <noreply@mail.bastionforge.com>`

---

## Step 4 — Push to a Vercel project

1. Sign in at <https://vercel.com> (GitHub OAuth, again)
2. **Add New → Project**
3. Select the `ballance/shadow-kpi` repo
4. **Configure Project** screen:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `./` (default)
   - **Build Command:** leave default (`next build`)
   - **Install Command:** leave default (`npm install`)
   - **Output Directory:** leave default (`.next`)
5. **Environment Variables** (the big one). Add all six:

   | Key | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string from Step 2 |
   | `AUTH_SECRET` | first hex string from Step 1 |
   | `AUTH_URL` | leave blank for now — we set this after first deploy |
   | `RESEND_API_KEY` | your `re_...` key from Resend dashboard |
   | `AUTH_EMAIL_FROM` | `shadow-kpi <noreply@mail.bastionforge.com>` |
   | `CRON_SECRET` | second hex string from Step 1 |

6. Click **Deploy**

The first build will fail with an Auth.js MissingSecret error if `AUTH_URL` isn't set. Don't worry — we set it next.

---

## Step 5 — Set AUTH_URL and redeploy

1. After the first deploy, Vercel gives you a URL like `https://shadow-kpi.vercel.app` (or `https://shadow-kpi-<hash>.vercel.app` for previews)
2. Go to **Project → Settings → Environment Variables**
3. Set `AUTH_URL` to that URL (no trailing slash) — apply to Production + Preview + Development
4. Redeploy via **Deployments → ... → Redeploy** on the latest deployment

This time the build is green and `/` loads.

---

## Step 6 — Custom domain (`shadow-kpi.bastionforge.com`)

1. **Project → Settings → Domains → Add** → enter `shadow-kpi.bastionforge.com`
2. Vercel gives you a CNAME record:
   - Type: `CNAME`
   - Host: `shadow-kpi`
   - Value: `cname.vercel-dns.com`
3. Add that at your registrar. Vercel auto-issues a Let's Encrypt cert once DNS propagates (~5 min)
4. Once Vercel marks it "Valid Configuration", update `AUTH_URL` in env from the `*.vercel.app` URL to `https://shadow-kpi.bastionforge.com`
5. Redeploy once more

---

## Step 7 — Verify the deploy

1. Open the live URL
2. Sign in with your own email — magic link should land in your inbox within seconds
3. Create a team. Note the invite URL — it should use your production domain, not `localhost:3333`
4. Open <https://vercel.com/<your>/shadow-kpi/logs> in another tab while you sign in to confirm Resend is firing
5. Check <https://vercel.com/<your>/shadow-kpi/crons> — both cron jobs (`lockup-sweep`, `weekly-reset`) should be listed and the next-run times should be sensible

---

## What runs where

| Component | Runs | Frequency |
|---|---|---|
| App | Vercel serverless | per request |
| Postgres | Neon | always-on (serverless, scales to zero) |
| Magic-link email | Resend → recipient inbox | on signin |
| `/api/cron/lockup-sweep` | Vercel cron | every minute (locks expired markets) |
| `/api/cron/weekly-reset` | Vercel cron | every Monday 00:00 UTC (refreshes allowances) |

Cron auth is via the `Authorization: Bearer <CRON_SECRET>` header that Vercel sends automatically. If a manual `curl` to the cron endpoint returns 401, that's correct — it means an unauthenticated request was rejected.

---

## Database migrations on future deploys

Drizzle migrations are not auto-applied on Vercel deploys. After merging a PR that adds a migration:

```bash
DATABASE_URL="<neon-pooled-url>" npm run db:migrate
```

For a tiny project this is fine. If you want it automated, add a `predeploy` script that runs migrations during build — but be careful: build-time migrations apply on every preview deploy, which can conflict with feature-branch DBs.

The cleanest pattern is a separate `migrate.yml` GitHub Actions workflow that runs on push to `master` with the production `DATABASE_URL` stored as a repo secret. Build that when you need it.

---

## Troubleshooting

**"Auth.js MissingSecret" on first deploy**
You set `AUTH_SECRET` but `AUTH_URL` is empty. Step 5 covers it.

**Magic-link emails don't arrive**
1. Check Resend logs at <https://resend.com/logs>
2. If you see "to: addr — rejected", the domain isn't verified yet (Step 3) or the `AUTH_EMAIL_FROM` doesn't use your verified domain
3. Check spam — DKIM + SPF need DMARC alignment for some providers; if mail is going to spam, set up DMARC properly

**Cron jobs not firing**
Vercel cron only runs on production deployments, not previews. Confirm the deployment that's marked "Production" includes `vercel.json` (it does — it's in repo root).

**Connection pool exhaustion under load**
You're on Neon free tier (~100 concurrent connections). The pooled connection string already uses PgBouncer; that's enough for ~hundreds of users. If you outgrow it, upgrade Neon or move to a connection-pooled hosted Postgres.

**Sessions disappear after deploy**
That's expected if `AUTH_SECRET` changed — every existing session is invalidated. Just sign in again. Never change `AUTH_SECRET` once you have real users.

---

## Cost

| Service | Free tier | Paid (if you outgrow it) |
|---|---|---|
| Vercel Hobby | Unlimited for personal use | Pro $20/mo per user |
| Neon | 0.5 GB storage, 100 concurrent connections | $19/mo entry tier |
| Resend | 100 emails/day, 3000/month | $20/mo for 50k |

For a team of <50 doughnut-betters, you're free indefinitely.

---

## When you're ready, send a screenshot of your first market resolution. I want to see what your team bet on.
