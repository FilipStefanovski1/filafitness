# FilaFitness

A private, mobile-first calorie and protein diary for two people, each with their own invite-only account. It has food diaries, recent foods and favorites, saved foods, meals and recipes, portion units, a ChatGPT estimate import, weight trends, and a remote MCP server so ChatGPT or Claude can log to *your* diary.

Stack: **Next.js 16 (App Router) · TypeScript · Tailwind v4 · Supabase Auth + Postgres · official MCP TypeScript SDK**. It fits on free tiers (Supabase Free + Vercel Hobby). See [Limits](#free-tier-limits).

---

## Contents

1. [Features](#features)
2. [How privacy works](#how-privacy-works)
3. [Local setup](#local-setup)
4. [Tests](#tests)
5. [Deploy (Supabase + Vercel)](#deploy-supabase--vercel)
6. [Invite the two accounts](#invite-the-two-accounts)
7. [Connect ChatGPT / Claude (MCP)](#connect-chatgpt--claude-mcp)
8. [Free-tier limits](#free-tier-limits)
9. [Design notes](#design-notes)
10. [Verification status](#verification-status)

---

## Features

**Today** (default screen): calories and protein consumed and remaining, with carbs and fat alongside. The diary is grouped by Breakfast / Lunch / Dinner / Snacks. You can move between dates (arrows or the native date picker), add to any date, and edit, delete or copy an entry. *Copy or save* copies entries or whole meals from any earlier day, or turns entries into a reusable meal.

**Add Food** opens on **Recent** and **Favorites**, with a search across foods, meals and recipes that works with Latin or Cyrillic (`подварок` = `podvarok`). The ⊕ button logs the default portion in one tap. Tapping a row lets you set a different portion first, using the numeric keypad, a unit picker and a live preview. **Quick add** takes a name and calories; macros are optional. **Paste GPT estimate** is described below.

**Units**: g, mL, serving, piece, slice, scoop. Conversions exist only where you defined them: a scoop can carry nutrition per scoop with no known weight, g↔mL needs a density, and a piece needs its gram weight. Anything undefined is refused rather than guessed. Foods can be marked raw, dry or cooked.

**Unknown macros** are stored as `null`, never `0`. Entries show "P unknown". Totals show `≥ X g` with a note explaining how many entries are incomplete.

**Foods** store nutrition per 100 g, per 100 mL or per labeled serving. They also hold aliases, an optional brand and barcode, a default portion and a favorite flag. There is an optional Open Food Facts barcode lookup that only prefills the form; manual label entry always works.

**Meals** are reusable groups of foods and/or recipe portions with default amounts, such as Raspberry oats. Changing an amount while logging affects only that entry. Saving the new amounts as the meal's default is an explicit checkbox.

**Recipes** hold ingredients plus a finished batch yield (grams or servings), which can be flagged as estimated. Batch nutrition is calculated from the ingredients and scaled to the portion you weigh. Entries from an estimated yield are marked "Est. yield".

**Snapshots**: every diary entry stores the nutrition spec and a component breakdown as they were at log time. Editing a label, meal or recipe later never changes past totals. Re-portioning an old entry uses its own snapshot.

**Sharing** (optional): send one food, meal or recipe to the other account. The recipient accepts an independent copy that includes the ingredients it needs. Diaries, targets and weigh-ins are never part of a share.

**Weight**: one private weigh-in per day (kg), editable by date. The chart shows recorded weigh-ins and the rolling 7-day average of *recorded* days; gaps stay gaps and are never filled with zero. Windows with fewer than 4 weigh-ins are flagged as sparse, and the current 7 days are compared with the previous 7.

**Today** also shows a calorie ring (Goal − Food = Remaining), protein, carbs and fat with targets or % of calories, a logging streak, and a water tracker (+glass, +500 mL, goal in Settings).

**Online foods and barcodes**: when nothing saved matches, Add Food searches **Open Food Facts** (free). **Scan barcode** uses the phone camera: native BarcodeDetector on Android, ZXing WebAssembly (served from this site) on iPhone. It checks your own library first, then Open Food Facts, then offers manual label entry. Online values are per 100 g and saved into your own library, where you can edit them.

**Installable app (PWA)**: a custom icon set (192/512/maskable/Apple touch), a manifest with shortcuts (Add food, Paste GPT estimate, Log weight), and a service worker that caches the app shell and shows an offline page. Diary data is never cached. Settings shows an **Install** button on Android/desktop Chrome, and on iPhone use Safari → Share → **Add to Home Screen**.

**Also**: weekly calorie and protein averages (over logged days only), editable goals, a timezone setting (default Europe/Skopje, which decides which day a late meal belongs to), CSV export of your own diary and weigh-ins, an optional "Import starter foods" button (generic USDA-rounded values), and an installable PWA manifest.

### GPT estimates

**A. Paste flow** (needs no AI API or key):
1. Add Food → **Paste GPT estimate** → **Copy prompt**.
2. In ChatGPT, paste the prompt with your text ("Izedov 230g podvarok i 36g kifla") or a photo.
3. Paste ChatGPT's reply back into the app. It's fine if the JSON is wrapped in prose or a code block. Every item becomes a fully editable card: name, amount, unit, raw/dry/cooked, kcal and macros (empty = unknown), and assumptions.
4. Save the selected items. Entries are marked **Estimate** and keep their assumptions. Tick "Save as a food" to reuse an item next time with the "GPT estimate" label preserved.
5. If the reply can't be parsed, the text stays on screen and **Enter manually** adds blank cards.

**B. MCP** is covered in [Connect ChatGPT / Claude](#connect-chatgpt--claude-mcp).

## How privacy works

- Every user-owned table has **row-level security** keyed on `auth.uid()` (`supabase/migrations/…_core.sql`).
- The app and the MCP server share one domain layer (`src/server/services/*`). Every query runs in a transaction **as the verified user**: `set local role authenticated` plus that user's id in `request.jwt.claims`. Postgres RLS therefore enforces ownership for both, and a log with several components is a single atomic transaction.
- The app learns the user from the verified Supabase session cookie. The MCP server learns it **only** from the bearer token (an OAuth access token or a personal token, stored as SHA-256 hashes). No tool takes a user id, so an AI cannot choose whose diary to write.
- Server credentials (`DATABASE_URL`, `SUPABASE_SECRET_KEY`) are never exposed to the browser. Public sign-up is disabled.
- All nutrition arithmetic is in `src/lib/nutrition/calc.ts` and uses decimal.js. Values are rounded only for display.

## Local setup

Prerequisites: Node 20.9+, Docker (Docker Desktop, colima or OrbStack), and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
```

```bash
supabase start
```

This applies `supabase/migrations`. The local stack uses ports **5642x** (API 56421, DB 56422, Studio 56423, Mailpit 56424) so it doesn't clash with other local Supabase projects.

Create `.env.local` from `.env.example` using the values from `supabase status`:

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56421
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY>
SUPABASE_SECRET_KEY=<SECRET_KEY>
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:56422/postgres
APP_URL=http://localhost:3000
```

Seed the local demo (this only works against a local database):

```bash
npm run seed:demo
```

That creates `filip@demo.local` / `demo-filip-1234` with Raspberry oats, dry pasta, a 25 g-protein shake (demo label values) and 14 days of weigh-ins. It also creates `partner@demo.local` / `demo-partner-1234` with a podvarok recipe on an estimated yield and a clearly labeled GPT-estimated podvarok entry.

```bash
npm run dev
```

Open http://localhost:3000. Use your browser's phone emulation, or your phone on the same network.

Demo data never goes into real accounts. Real accounts start empty; "Import starter foods" in Settings is opt-in.

## Tests

```bash
npm test
```

Unit tests: nutrition math, units, dates/timezones, search, GPT parsing, weight trend.

```bash
npm run test:integration
```

Integration tests against local Supabase. They cover the acceptance flows, RLS isolation, sharing, snapshots, atomicity and midnight dates. `tests/integration/mcp.test.ts` also needs the app running (`npm run dev`, or `npm run build && npm start`). Point it at a different port with `MCP_BASE_URL`.

```bash
npm run typecheck && npm run lint && npm run build
```

Manual MCP check with the official Inspector:

```bash
npm run token -- --email filip@demo.local --name Inspector
```

```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp --transport http --header "Authorization: Bearer <token>" --method tools/list
```

## Deploy (Supabase + Vercel)

Nothing below needs a paid plan.

### 1. Supabase project
1. Create a project at supabase.com (Free). Pick a region near you, e.g. Frankfurt `eu-central-1`.
2. Apply the schema from this repo:

```bash
supabase login
```

```bash
supabase link --project-ref <project-ref>
```

```bash
supabase db push
```

3. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up" and keep **Email** enabled.
4. **Authentication → URL Configuration**: set Site URL to `https://<your-app>.vercel.app` and add the Redirect URL `https://<your-app>.vercel.app/**`.
5. Collect the credentials:
   - **Project Settings → API Keys**: the publishable key (`sb_publishable_…`) and a secret key (`sb_secret_…`).
   - **Connect → Transaction pooler**: the URI (`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres`). Use the pooler, port 6543, for serverless.

### 2. Vercel
1. Push this repo to GitHub, then **Add New Project** in Vercel and import it. The framework is auto-detected as Next.js.
2. Environment variables (Production):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_…` (server only) |
   | `DATABASE_URL` | transaction-pooler URI (server only) |
   | `APP_URL` | `https://<your-app>.vercel.app` (the OAuth issuer for MCP; no trailing slash) |

3. In **Settings → Functions**, set the region close to the database (e.g. `fra1` for Frankfurt).
4. Deploy, then open `https://<your-app>.vercel.app`. You should get the login page.

## Invite the two accounts

There is no public sign-up. Run the invite script from your machine with the **production** values in a local file such as `.env.production.local` (git-ignored). Use the same five variables as above.

**You**, with your starting targets prefilled (editable later, and only for your account):

```bash
npm run invite -- --env .env.production.local --email you@example.com --name Filip --kcal 2900 --protein 150 --goal 80
```

**Your girlfriend**, who sets her own goals during onboarding:

```bash
npm run invite -- --env .env.production.local --email her@example.com --name Ana
```

Each command prints a one-time link (valid 24 h). Send it however you like. Opening it leads to choosing a password, then onboarding with goals, timezone and an optional current weight. Add `--send` if you'd rather have Supabase email the invite. The built-in mailer is heavily rate-limited, so the printed link is more reliable.

Alternative: Supabase dashboard → **Authentication → Users → Invite user**. The default email template then lands on the login page. Change the "Invite user" template link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` so it goes straight to set-password.

Later sign-ins use email + password, or "Email me a sign-in link".

## Connect ChatGPT / Claude (MCP)

MCP endpoint: `https://<your-app>.vercel.app/api/mcp` (Streamable HTTP, stateless). It is also shown under **Settings → Connect ChatGPT or Claude**.

Each person connects from **their own** ChatGPT or Claude account and signs in with **their own** FilaFitness login on the consent screen. Whoever signs in there is the only diary that connection can touch.

- **ChatGPT** (web, a plan with Developer mode): Settings → Apps & Connectors → Advanced settings → enable **Developer mode** → **Create**. Paste the MCP URL and choose **OAuth**. ChatGPT registers itself automatically through dynamic client registration and opens the FilaFitness consent page; sign in and press **Allow**. In a chat, enable the connector and ask e.g. "Log 230 g of my podvarok for lunch". Write tools ask for confirmation in ChatGPT.
- **Claude** (claude.ai or desktop): Settings → Connectors → **Add custom connector** → paste the URL → Connect, then sign in and Allow.
- **Claude Code / other clients that take a header**: create a token in Settings (or with `npm run token`), then run:

```bash
claude mcp add --transport http filafitness https://<your-app>.vercel.app/api/mcp --header "Authorization: Bearer ffp_…"
```

To disconnect, go to **Settings → Revoke**. Revoking an OAuth connection also revokes its refresh tokens.

**Tools**: `search_library`, `preview_nutrition`, `log_saved_item`, `log_estimate`, `get_daily_summary`, `log_weigh_in`, `get_weight_trend`.
- Writes need a client-generated `request_id`. Replaying the same id returns the original result, so retries never double-log. Two intentional logs use two ids and create two entries. Reusing an id with different arguments is rejected.
- `log_saved_item` returns `needs_choice` with candidates when a query matches several items. It returns `needs_portion` when no amount was given (unless `use_default_portion` is set). Nothing is written in either case.
- `log_estimate` saves all items atomically with their assumptions and the source label "ChatGPT estimate". Null macros stay unknown.
- Successful writes return the saved item, its date, kcal and protein, and the remaining daily targets. A failed write returns an error, never success.

## Free-tier limits

- **Supabase Free**: 500 MB database, 50k monthly active users, and 2 free projects. **Projects pause after 7 days without activity**; daily use keeps it awake, and a paused project can be resumed from the dashboard. Built-in auth email is rate-limited (a few emails per hour), which is why invites print a link. No paid add-ons are used.
- **Vercel Hobby**: for personal, non-commercial use, which fits two people. The MCP route sets `maxDuration = 30` s, within Hobby limits.
- **Open Food Facts** barcode lookup is free, keyless and optional.
- **No paid AI API.** The paste flow uses your own ChatGPT, and MCP uses your ChatGPT or Claude subscription.

## Design notes

- `src/lib/nutrition/calc.ts`: units, portions, sums with unknowns, and recipe batch → per-100 g or per-serving specs.
- `src/server/services/diary.ts`: drafts (food / recipe / meal / estimate / quick add) become one entry plus its components in one transaction. Snapshots live in `diary_components.snapshot`.
- An estimate's snapshot stores the exact stated totals as one "portion", so logging the same amount reproduces ChatGPT's numbers exactly and other amounts scale from it.
- Dates are plain `date` values in the user's timezone. `defaultLogTarget(tz, now)` decides the day and meal for "now", so 00:15 in Skopje is the new day.
- `src/server/mcp/server.ts`: the MCP tools, thin wrappers over the same services. `src/server/oauth/*` plus the `/oauth/*` and `/.well-known/*` routes form a minimal OAuth 2.1 authorization server (DCR, PKCE S256, refresh rotation).
- Food search keys transliterate Macedonian Cyrillic and fold romanizations (ж/zh/ž, ќ/kj/ć, ш/sh/š…).

## Live deployment

- App: https://filafitness.vercel.app (Vercel project `filafitness`; every push to `main` deploys)
- Database: Supabase project `filafitness` (`iqyepshlofrtqjefahfk`, eu-central-1). Production secrets are in `.env.production.local` (git-ignored) and in Vercel env vars.
- New migrations: `supabase db push` (linked project).

## Verification status

See the final report in the PR or commit message for the latest run. Summary at the time of writing:

- ✅ 51 automated tests pass (unit + integration + MCP over HTTP), against both `next dev` and the production build.
- ✅ `npm run build`, `tsc` and ESLint are clean.
- ✅ Key flows were exercised by hand at 375 px width: login, Today, Add Food (recent, favorites, search in both scripts, one-tap log), the meal portion override, the GPT paste import (including save-as-food), weight, settings, sign-out, and the OAuth consent screen.
- ✅ The MCP endpoint was tested with the official SDK client and the MCP Inspector CLI, using personal tokens and a full browser OAuth consent → token → tool call.
- ⏳ **Not yet verified: real ChatGPT write access, for either account.** ChatGPT needs a public HTTPS URL, so this requires the deployment above. After deploying, follow [Connect ChatGPT](#connect-chatgpt--claude-mcp) once per account and log something.
