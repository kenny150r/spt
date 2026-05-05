# Baby Tracker

A small, mobile-friendly web app for logging weights, feeds, and diapers and
visualizing growth on the WHO weight-for-age growth curve.

- **Frontend:** Vite + React + TypeScript + Tailwind, with Recharts for the
  growth chart.
- **Backend:** [Supabase](https://supabase.com/) (Postgres + magic-link auth).
- **Hosting:** GitHub Pages, deployed via GitHub Actions on push to `main`.

> Disclaimer: WHO growth-curve overlays are reference values for general
> visualization only and are not medical advice. Talk to your pediatrician
> about your child's growth.

---

## 1. Set up Supabase (one time)

1. Create a free account at [supabase.com](https://supabase.com/) and create a
   new project.
2. In the project dashboard, open **SQL editor → New query**, paste the
   contents of [`supabase/schema.sql`](supabase/schema.sql), and run it. This
   creates the tables and locks them down to authenticated users only.
3. Go to **Authentication → Providers → Email** and:
   - Make sure **Email** is enabled.
   - Turn **off** *Allow new users to sign up* (so only people you invite can
     get in).
4. Go to **Authentication → Users** and click **Invite user** for both your
   email and your wife's. Each of you will get a magic-link email to sign in
   with.
5. Grab the project URL and anon key from **Project Settings → API → Project
   API keys**. You'll plug these into the app next.

## 2. Run locally

```bash
cp .env.example .env
# then edit .env with your Supabase URL + anon key
npm install
npm run dev
```

Open <http://localhost:5173>, sign in with the email you invited, fill in
your baby's name + birthday, and start logging.

## 3. Deploy to GitHub Pages

This repo already includes a GitHub Actions workflow at
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) that builds the
site and publishes it to GitHub Pages on every push to `main`.

### One-time setup

1. Push the repo to GitHub (e.g. `https://github.com/<you>/spt`).
2. In the repo, go to **Settings → Pages** and set **Source** to
   *GitHub Actions*.
3. Go to **Settings → Secrets and variables → Actions → Variables** and add:
   - `VITE_SUPABASE_URL` — your Supabase project URL.
   - `VITE_SUPABASE_ANON_KEY` — your Supabase anon key.
   - *(Optional)* `VITE_BASE_PATH` — only needed if you use a custom domain
     (set to `/`) or your repo has a different name than what the URL ends
     with. Defaults to `/<repo-name>/`.
4. In Supabase, go to **Authentication → URL configuration** and add your
   GitHub Pages URL (e.g. `https://<you>.github.io/spt/`) to both the **Site
   URL** and **Redirect URLs** so magic-link sign-ins land back on your
   deployed app.
5. Push to `main`. The workflow will build and deploy. Visit
   `https://<you>.github.io/<repo>/` (or whatever URL Pages assigns).

### After it's live

- Add the site to your phone's home screen for an app-like experience
  (Safari: Share → Add to Home Screen; Chrome: ⋮ → Install app).
- Both parents sign in via magic link and see the same data.

---

## Importing historical data from a spreadsheet

If you've already been tracking feeds/diapers in a spreadsheet, there's a
script to bulk-load them: [`scripts/import-csv.mjs`](scripts/import-csv.mjs).
It expects roughly the format `Date, Time, breast feeding time, Bottle,
Diaper, (empty), Notes` (Date is forward-filled per day; Time is HHMM-ish or
"Midnight"; Breast/Bottle accept things like `30 min` / `30mL`; Diaper text
is matched against keywords for pee/poop/both; weights are extracted from
notes when they look like grams, e.g. `2273 grams`).

```bash
# Preview without writing anything:
npm run import -- "/path/to/your.csv" --dry-run

# Actually insert (will prompt for your Supabase email + password):
npm run import -- "/path/to/your.csv"
```

The script signs in as you, so RLS protects your data — it can't be run by
anyone who doesn't already have access. It does NOT deduplicate on re-runs,
so only run it once (or delete previous imports first if you re-run).

## Staying signed in

The Supabase client is configured with `persistSession: true` and
`autoRefreshToken: true`, so once you sign in on a device you stay signed in
indefinitely (until you tap the logout icon in the header or clear the
browser's site data). The default access-token lifetime is 1 hour, but it's
silently refreshed in the background. If you want fewer refreshes, bump the
JWT expiry in **Supabase → Authentication → Sessions** (e.g. to 1 week).

## Project structure

```
src/
  components/      Auth, baby setup, layout, sheet/modal, forms
  views/           LogView (quick entry + activity), GrowthView, SettingsView
  lib/
    api.ts         Typed Supabase data access
    supabase.ts    Supabase client
    types.ts       Domain types
    who.ts         WHO weight-for-age reference percentiles (0–36 mo)
    format.ts      Date/weight/unit helpers
supabase/
  schema.sql       Tables + RLS policies (idempotent, run once)
.github/workflows/
  deploy.yml      Build + deploy to GitHub Pages
```

## Notable conveniences

- **Two units everywhere** — log weights in lb/oz or kg, view chart in either.
- **Mobile-first** — bottom nav, large tap targets, bottom-sheet modals,
  works as a home-screen PWA-ish app.
- **Latest percentile** — the Growth view shows the current weight's
  estimated WHO percentile.
- **Two-parent ready** — invite both emails in Supabase, both see the same
  shared timeline.
