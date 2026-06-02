# EdgeStatus — Claude Context

This file is read automatically by Claude Code at the start of every session.
It documents current implementation state, known issues, and where to pick up next.

---

## What This Project Is

A public, read-only sports playoff probability web app. No auth. No login.
Users see playoff odds, division title odds, championship odds, and seed distributions
for NBA, NHL, MLB, NFL, and MLS — all powered by Monte Carlo simulation.

**Live URL:** https://kdrey21.github.io/edge-status
**GitHub:** https://github.com/kdrey21/edge-status
**Owner:** Keith Dreyer (keith.dreyer@gmail.com)

---

## Tech Stack

- **Framework:** Next.js 14.2.5 (App Router, TypeScript, static export)
- **Styling:** Tailwind CSS v3 (dark mode default, no toggle)
- **Charts:** Recharts (client-only via dynamic import)
- **Database:** Supabase (Postgres, free tier)
- **Hosting:** GitHub Pages (free) — static HTML, no server runtime
- **Sim runner:** GitHub Actions (daily cron, free tier)
- **Config file:** `next.config.mjs` — NOT `.ts` (Next.js 14 doesn't support `.ts` config)

### Why Static Export + GitHub Actions?
- Vercel free tier has a 10s function timeout — not enough for 5-league simulation
- GitHub Actions gives unlimited execution time for the sim (no timeout)
- GitHub Pages is free with no bandwidth limits for small sites
- Total cost: $0/month

---

## Key Implementation Decisions

### Static Export (`output: 'export'`)
`next.config.mjs` sets `output: 'export'`. All pages are pre-rendered to static HTML
during `npm run build`. The browser then hydrates and fetches live data from Supabase
using the anon key.

- `basePath: '/edge-status'` — GitHub Pages serves at `/edge-status/` subpath
- `assetPrefix: '/edge-status'` — JS/CSS chunks are prefixed correctly
- All page components are `'use client'` — data is fetched via `useEffect`
- `generateStaticParams` for `[league]` returns the 5 known slugs
- `generateStaticParams` for `[league]/[team]` queries Supabase during build

### Data Flow
1. **GitHub Actions** (`simulate.yml`) runs `scripts/simulate.ts` daily at 06:00 UTC
2. Script fetches ESPN standings + schedules, runs Monte Carlo sim, writes to Supabase
3. **Browser** loads static HTML from GitHub Pages, hydrates, fetches from Supabase (anon key)
4. Schedule data on team pages is fetched from ESPN directly in the browser (best-effort)

### ESPN API
The standard standings endpoint (`site.api.espn.com/apis/site/v2/sports/.../standings`)
returns a stub `{"fullViewLink":...}` during and after playoffs. Do NOT use it.

**Use the core API instead:**
```
https://sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/seasons/{year}/types/2/groups
```

The core API returns full standings year-round. Win/loss data comes from
`records[0].summary` (e.g. `"94-68"`), not from a `stats` array.
Team IDs are extracted from `$ref` URLs using regex.

### Season Year Logic
- Hockey/Basketball: season started previous October → use `year - 1` for months Jan–Sep
  - e.g. April 2026 → NHL/NBA season = 2025 (the 2025-26 season)
- Baseball/Soccer/Football: use current calendar year
  - e.g. April 2026 → MLB season = 2026

This logic lives in `src/lib/espn.ts → seasonYear()`.

### MLS Core API Identifier
MLS uses `espnPath: 'soccer/usa.1'` for the site API but `coreLeague: 'mls'`
for the core API. The `coreLeague` field in `LeagueConfig` overrides the league
segment when building core API URLs.
MLS currently returns 0 teams — still unresolved (see Known Issues).

### Supabase Client
**IMPORTANT:** Two distinct contexts with different env vars:

| Context | Env var name | Used where |
|---|---|---|
| Browser (anon, read-only) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase.ts`, all pages |
| GitHub Actions script (service role, write) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `scripts/simulate.ts` only |

The `NEXT_PUBLIC_*` vars are baked into the JS bundle at build time. They are safe
to expose — the anon key is public by design; RLS protects all writes.

### Simulation
- 50,000 Monte Carlo simulations per league
- Elo initialized from win percentage: `1500 + (winPct - 0.5) * 400`
- Home advantage: +65 Elo points
- Playoff bracket: best-of-7 series using `seriesWinProb()` calculation
- Results written to Supabase using service role key (write-only, script only)
- Frontend reads with anon key (read-only, RLS policy allows public SELECT)

---

## Database Schema (current — Phase 3)

```sql
create table sim_results (
  id                   uuid primary key default gen_random_uuid(),
  team                 text not null,           -- team abbreviation e.g. "BOS"
  league               text not null,           -- "nba", "nhl", "mlb", "nfl", "mls"
  wins                 int default 0,
  losses               int default 0,
  games_back           numeric default 0,
  playoff_pct          numeric,
  div_title_pct        numeric,
  conf_title_pct       numeric,
  championship_pct     numeric,
  seed_distribution    jsonb,                   -- {"1": 12.3, "2": 18.1, ...}
  magic_number         int,
  elim_number          int,
  -- Phase 3 market edge columns (null when API keys not set or market unavailable)
  kalshi_champ_pct     numeric,                 -- Kalshi field-normalized championship %
  sportsbook_champ_pct numeric,                 -- Odds API multiplicatively de-vigged %
  champ_ev_pct         numeric,                 -- EV%: kalshi_champ_pct − sportsbook_champ_pct
  -- Legacy (kept for schema compat, no longer written)
  implied_playoff_pct  numeric,
  edge_pct             numeric,
  updated_at           timestamptz default now(),
  unique (team, league)
);

alter table sim_results enable row level security;
create policy "Public read" on sim_results for select using (true);
```

### Schema migration (run once in Supabase SQL editor):
```sql
alter table sim_results
  add column if not exists kalshi_champ_pct     numeric,
  add column if not exists sportsbook_champ_pct numeric,
  add column if not exists champ_ev_pct         numeric;
```

---

## GitHub Actions Secrets Required

Go to: `github.com/kdrey21/edge-status` → Settings → Secrets and variables → Actions

| Secret name | Used by | Value |
|---|---|---|
| `SUPABASE_URL` | `simulate.yml` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `simulate.yml` | Service role key (Supabase → API settings) |
| `NEXT_PUBLIC_SUPABASE_URL` | `deploy-pages.yml` | Same Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `deploy-pages.yml` | Anon/public key (Supabase → API settings) |
| `ODDS_API_KEY` | `simulate.yml` | The Odds API key (https://the-odds-api.com) — optional |
| `KALSHI_API_TOKEN` | `simulate.yml` | Kalshi read-only Bearer token (kalshi.com → Settings → API) — optional |

GitHub Pages must be enabled: repo Settings → Pages → Source: **GitHub Actions**

**Market data secrets are optional** — the sim runs fine without them; market columns will be null.

---

## Current Status

### Phases Complete
- **Phase 1** ✓ — GitHub Actions (simulate.yml + deploy-pages.yml), GitHub Pages static export, basePath /edge-status
- **Phase 2** ✓ — MLS fixed (usa.1 + seasonType 1), inferConference rewritten sport-specific, synthetic schedule removed
- **Phase 3** ✓ — Market edge engine: src/lib/odds.ts + src/lib/kalshi.ts, simulate.ts updated, StandingsTable shows Kalshi/Book/EV% columns + VALUE badge, TeamPageClient shows edge card

### Working ✓
- NBA (30 teams), NHL (32 teams), MLB (30 teams), MLS simulate successfully
- NFL correctly shows as inactive in off-season
- Static export builds cleanly with `npm run build`
- GitHub Actions workflows: `simulate.yml` (daily sim), `deploy-pages.yml` (on push)
- Supabase RLS configured for public reads
- Standings table: W, L, GB, Playoff %, Div %, Sim Champ %, Kalshi %, Book %, EV% (market cols auto-hide when no data)
- Team detail page: stat cards, championship edge card (when data available), seed chart, upcoming schedule
- Home page shows league cards with active/inactive badge

### Not Working / Known Issues
- **MLS returns 0 teams** — core API identifier may be wrong or MLS season
  not yet detected. Try: `curl -s "https://sports.core.api.espn.com/v2/sports/soccer/leagues/mls/seasons/2026/types/2/groups?limit=5"`
- **NFL is off-season** — correct behavior, will auto-activate in September
- **`inferConference()` is buggy** — MLB AL/NL detection is fragile; "central"/"south"
  wrongly maps to Western Conference. Fix in Phase 2.
- **Synthetic schedule fallback** — if ESPN future games are missing, simulation
  fabricates a random schedule which corrupts results. Fix in Phase 2.
- **ESPN CORS from browser** — team page schedule fetches ESPN from the browser.
  If CORS fails, shows "No upcoming games found." gracefully.
- **GitHub Pages not yet enabled** — user must enable Pages in repo settings after
  first push of these workflow files.

### Phase 2 (next)
- **Fix MLS** — debug why core API returns 0 teams
- **Fix `inferConference()`** — make it data-driven per sport
- **Fix synthetic schedule** — mark results as low-confidence or skip if no real schedule
- **Kalshi + Odds API edge finder** — new product thesis: market-vs-market discrepancy
  - Kalshi championship/division markets → normalize to 100% → fair prob
  - Sportsbook futures → de-vig (multiplicative) → implied prob
  - Edge = where sportsbook implied prob < Kalshi fair prob
  - Add schema columns: kalshi_fair_pct, sportsbook_implied_pct, ev_pct

### Phase 3 (future)
- Snapshot history table for CLV tracking
- Sparklines for playoff % trend
- "Tracked edges" view showing how flagged values resolved

---

## File Map

```
.github/
├── workflows/
│   ├── simulate.yml        # Daily Monte Carlo sim → Supabase (GitHub Actions)
│   └── deploy-pages.yml    # Static export → GitHub Pages (on push to main)
scripts/
└── simulate.ts             # Standalone sim script (run by simulate.yml)
src/
├── types/index.ts              # SimResult, LeagueTeam, Game, LeagueConfig, LEAGUES[]
├── lib/
│   ├── espn.ts                 # ESPN Core API: standings + upcoming games
│   ├── simulation.ts           # Monte Carlo engine (50k sims, Elo, bracket)
│   └── supabase.ts             # Anon client helpers (NEXT_PUBLIC_ vars, browser-safe)
├── components/
│   ├── LeagueCard.tsx          # Home page card, active/inactive badge
│   ├── StandingsTable.tsx      # Sortable table, color-coded %, edge column
│   ├── SeedChart.tsx           # Recharts bar chart (client-only, dynamic import)
│   └── ScheduleTable.tsx       # Upcoming games + win probability per game
└── app/
    ├── layout.tsx              # Dark bg, sticky header, footer
    ├── page.tsx                # Home: league grid (client component)
    ├── globals.css             # Tailwind base + dark scrollbar
    ├── [league]/
    │   └── page.tsx            # Standings for one league (client component)
    └── [league]/[team]/
        └── page.tsx            # Team detail: stat cards, seed chart, schedule (client component)
```

---

## Common Commands

```bash
# Local dev (requires .env.local with NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY)
npm run dev

# Build check before pushing (requires NEXT_PUBLIC_* env vars)
NEXT_PUBLIC_SUPABASE_URL=xxx NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx npm run build

# Run sim locally (writes to Supabase)
SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/simulate.ts

# Push to GitHub (triggers Vercel auto-deploy)
git add -A && git commit -m "message" && git push

# If push rejected (remote ahead)
git pull --rebase && git push

# Test ESPN core API directly
curl -s "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/groups?limit=5"

# Test MLS specifically
curl -s "https://sports.core.api.espn.com/v2/sports/soccer/leagues/mls/seasons/2026/types/2/groups?limit=5"
```

---

## Local Development

Create `.env.local` at repo root with:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

Then `npm run dev`. The sim script needs separate vars:
```bash
export SUPABASE_URL=https://xxxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
npx tsx scripts/simulate.ts
```

---

## What To Work On Next (Phase 2)

In priority order:

1. **Enable GitHub Pages** — repo Settings → Pages → Source: GitHub Actions
2. **Add GitHub Actions secrets** — 4 secrets listed above
3. **Trigger first deploy** — push to main or run `workflow_dispatch` on deploy-pages.yml
4. **Fix MLS** — debug core API returning 0 teams
5. **Fix `inferConference()`** — make MLB AL/NL and other conference detection reliable
6. **Wire Kalshi + Odds API** — new edge finder (market vs market discrepancy)
