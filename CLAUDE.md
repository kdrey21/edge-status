# EdgeStatus — Claude Context

This file is read automatically by Claude Code at the start of every session.
It documents current implementation state, known issues, and where to pick up next.

---

## What This Project Is

A public, read-only sports playoff probability web app. No auth. No login.
Users see playoff odds, championship odds, market edge vs sportsbooks, and seed distributions
for NBA, NHL, MLB, NFL, and MLS — all powered by Monte Carlo simulation.

**Live URL:** https://kdrey21.github.io/edge-status
**GitHub:** https://github.com/kdrey21/edge-status

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

The standings records array also contains breakdown records used for tiebreakers:
- MLB: `"Intradivision"` → division record, `"Intraleague"` → conference record
- NBA: `"vs. Div."` → division record, `"vs. Conf."` → conference record
Match by name substring (case-insensitive), not by ID (IDs vary by sport).

### Season Year Logic
ESPN stores multi-year seasons by their **ending year**:
- e.g. the 2025-26 NBA/NHL season = ESPN season "2026"
- `seasonYear()` in `espn.ts`: returns `year` for Jan–Sep, `year + 1` for Oct–Dec
- Baseball/Soccer/Football: use current calendar year directly

### fetchGroupIds — Division vs Conference Groups
ESPN nests some leagues as conferences → divisions (children).
`fetchGroupIds` detects `isConference: true` groups and recursively fetches children
so teams get correct division labels (e.g. "Southwest", not "Western Conference").
This is required for correct `div_title_pct` and tiebreaker calculations.

### MLS Core API Identifier
MLS uses `espnPath: 'soccer/usa.1'` for the site API but `coreLeague: 'usa.1'`
for the core API. The `coreLeague` field in `LeagueConfig` overrides the league
segment when building core API URLs.

### Supabase Client
**IMPORTANT:** Two distinct contexts with different env vars:

| Context | Env var name | Used where |
|---|---|---|
| Browser (anon, read-only) | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase.ts`, all pages |
| GitHub Actions script (service role, write) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `scripts/simulate.ts` only |

The `NEXT_PUBLIC_*` vars are baked into the JS bundle at build time. They are safe
to expose — the anon key is public by design; RLS protects all writes.

### Simulation Architecture

**Sport-specific playoff seeding** (`src/lib/simulation.ts`):

| Sport | Format | Series lengths |
|---|---|---|
| MLB | 3 div winners + 3 WCs per league; seeds 1-2 get byes | WC=best-of-3, DS=best-of-5, CS/WS=best-of-7 |
| NFL | 4 div winners + 3 WCs per conf; seed 1 has bye | All single-elimination games |
| NBA | Top 6 guaranteed; seeds 7-10 play-in tournament | All best-of-7 |
| NHL | Top 3 per division + 2 WCs per conference | All best-of-7 |

**Tiebreaker chain** (when teams tie on overall win%):
1. Division win% — extracted from ESPN standings (`vs. Div.` / `Intradivision`)
2. Conference win% — extracted from ESPN standings (`vs. Conf.` / `Intraleague`)
3. Total wins (fallback)
4. **TODO: H2H record** — primary tiebreaker in MLB/NFL/NBA rules; requires fetching
   full season game logs. Not yet implemented.

**Playoff state adjustment**: When regular season ends (gamesRemaining=0), the sim
fetches ESPN's postseason scoreboard (`seasontype=3`) to identify teams still alive.
Eliminated teams get championship_pct=0 and conf_title_pct=0; alive teams are
renormalized. Guards against MLB returning regular season events (checks `season.type===3`).

**Off-season market-only mode**: For leagues with no active season (NFL off-season),
if `marketNameMap` is configured, the sim fetches Kalshi + Odds API futures and
upserts market-only rows with null sim columns. Useful for year-round Super Bowl futures.

### Schedule Coverage Known Gap
`fetchUpcomingGames` fetches the next 30 days with `limit=500`. ESPN caps responses
at 500 events per request. For MLB (162-game season), this covers ~1/3 of the
remaining schedule. The sim simulates the rest blind (Elo-weighted random matchups).

**TODO**: Paginate the schedule using multiple date-range requests to cover the full
remaining season for MLB and MLS.

---

## Database Schema (current)

```sql
create table sim_results (
  id                   uuid primary key default gen_random_uuid(),
  team                 text not null,
  league               text not null,
  wins                 int default 0,
  losses               int default 0,
  games_back           numeric default 0,
  playoff_pct          numeric,
  div_title_pct        numeric,
  conf_title_pct       numeric,
  championship_pct     numeric,
  seed_distribution    jsonb,
  magic_number         int,
  elim_number          int,
  kalshi_champ_pct     numeric,
  sportsbook_champ_pct numeric,
  champ_ev_pct         numeric,
  implied_playoff_pct  numeric,   -- legacy, no longer written
  edge_pct             numeric,   -- legacy, no longer written
  updated_at           timestamptz default now(),
  unique (team, league)
);

create table sim_snapshots (
  id                   uuid primary key default gen_random_uuid(),
  team                 text not null,
  league               text not null,
  snap_date            date not null default current_date,
  playoff_pct          numeric,
  div_title_pct        numeric,
  championship_pct     numeric,
  kalshi_champ_pct     numeric,
  sportsbook_champ_pct numeric,
  champ_ev_pct         numeric,
  unique (team, league, snap_date)
);

alter table sim_results enable row level security;
create policy "Public read" on sim_results for select using (true);
alter table sim_snapshots enable row level security;
create policy "Public read" on sim_snapshots for select using (true);
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
| `NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY` | `deploy-pages.yml` | Web3Forms access key (web3forms.com) for the "Report an issue" button — emails reports to the registered inbox. Public-safe (UUID, not an email). Button stays hidden until set. |

**All secrets use individual values** — do NOT combine into a single multi-line secret.
Each secret field contains only the value (no `KEY=` prefix).

GitHub Pages must be enabled: repo Settings → Pages → Source: **GitHub Actions**

---

## Current Status

### Phases Complete
- **Phase 1** ✓ — GitHub Actions (simulate.yml + deploy-pages.yml), GitHub Pages static export
- **Phase 2** ✓ — MLS fixed, inferConference rewritten sport-specific, synthetic schedule removed
- **Phase 3** ✓ — Market edge engine: Kalshi + Odds API, EV% columns, VALUE badge
- **Phase 4** ✓ — Snapshot history (sim_snapshots table), sparklines, 7-day trend deltas

### Architecture Improvements Since Phase 4
- **Season year fix**: ESPN uses ending year for multi-year seasons (2025-26 → "2026")
- **Division groups**: fetchGroupIds now fetches children of conference groups for real divisions
- **Sport-specific seeding**: MLB div winners/WCs, NFL single-game, NBA play-in, NHL div-based
- **Playoff elimination**: Eliminated teams get 0% championship/conf odds via ESPN scoreboard check
- **Off-season futures**: NFL shows FUTURES badge with Kalshi/book odds year-round
- **Tiebreakers**: Division and conference record extracted from ESPN, used in sim sorting

### Working ✓
- NBA (30 teams), NHL (32 teams), MLB (30 teams) simulate with correct playoff formats
- NFL shows FUTURES mode with Super Bowl odds year-round
- MLS simulates (standings work, schedule data sparse)
- Playoff elimination correctly zeros out eliminated teams
- Sparklines build up over daily sim runs
- All 6 GitHub secrets set individually (no combined secret file)

### Known Issues / TODO
1. **H2H tiebreaker** — primary tiebreaker (MLB/NFL/NBA) not yet implemented; using div/conf record as proxy
2. **MLS game importance** — weekly schedule means 14-day window sometimes missed matchdays; expanded to 21 days
3. **Team position description** — natural language summary of a team's current playoff situation
4. **Team page "Upcoming Schedule" blank** — ESPN direct browser fetch fails silently (likely CORS). Fix: store upcoming schedule in Supabase during sim run (already have game data), then fetch from there. Or hide section until Phase 5 redesign.

---

## Upcoming Work (in priority order)

1. **Phase 5 — Team fan UI** — DO THIS LAST, after data is correct:
   - **Team history line chart** — Recharts multi-line chart on team page showing playoff_pct +
     championship_pct trend over last 14 days (data available in sim_snapshots, just needs
     a client-side filter-by-team + LineChart component using existing Recharts dependency)
   - Tiebreaker context when teams are close ("PHI leads ATL in H2H 4-2")
   - **Mobile UX pass** — stat card descriptions are currently always-visible inline text
     (replaced hover tooltips which don't work on touch). Phase 5 should redesign the card
     layout for mobile: consider collapsible info rows, bottom sheets, or a purpose-built
     mobile card component that doesn't need the description text to be always visible.
   - Design refresh (better hierarchy, mobile layout)
   - Fix blank "Upcoming Schedule" section on team page (ESPN direct browser fetch fails;
     solution is to write upcoming schedule to Supabase during sim run, read it same as other data)
   - All new data features need to be designed into the layout, not bolted on

---

## Feature Backlog (planned, not yet built)

### Backlog 1 — Model confidence indicator
**Goal:** Surface a per-team "how settled / trustworthy is this projection" signal as an
additional data layer (column in the standings table + badge on the team page).

**Feasibility:** Yes — derivable entirely from data the Monte Carlo already produces; no
new external source required. The single point-estimate probabilities throw away the
distributional information we already compute.

**Candidate signals (combine into one score):**
1. **Outcome decisiveness** — entropy of `seed_distribution` (already stored). Low entropy
   (locked into one seed) = high confidence; spread across many seeds = low confidence.
   Alternative/companion: distance of `playoff_pct` from 50% (toss-ups are low confidence).
2. **Season progress** — `1 − gamesRemaining/totalGames`. Early season = lower confidence
   (Elo from a small sample, lots of unplayed games). Once the postseason override applies
   (playoff_pct is 100/0), confidence is effectively maxed.
3. **Projection stability** — standard deviation of `playoff_pct` across the last N rows in
   `sim_snapshots` (history we already keep). Day-to-day churn = low confidence; flat = high.

**Recommended output:** a 0–100 `model_confidence` score (or 3-tier High/Med/Low badge),
computed in `scripts/simulate.ts`, blending the three signals (tune weights empirically).

**Requirements / tasks:**
- Schema: `alter table sim_results add column if not exists model_confidence numeric;`
  (also add to `sim_snapshots` if we want to trend it).
- Compute in simulation/sim script; expose via `SimResult` type + supabase select.
- UI: new sortable column in `StandingsTable` and a badge on the team page. Tooltip must
  explain it. Color scale distinct from the playoff-heat and edge colors (don't overload
  green/red — pick a neutral/brand ramp).

**Important caveat to document in the UI copy:** at N=50k the Monte Carlo *sampling* error
is ~0.2%, so "confidence" here means **how settled the outcome is**, NOT statistical
precision, and must NOT be read as confidence that the model beats the market.

---

### Backlog 2 — Quarterly cross-league championship parlay
**Goal:** A curated 4-leg "title parlay" — one champion pick per major league
(NBA, NHL, MLB, NFL) — that balances market edge with realism. Intended as a shareable
social card and/or a premium feature to drive traction.

**Selection algorithm (one pick per league):**
1. Candidate pool = teams with championship futures in that league.
2. **Realism filter (PRIMARY — rank-based, not absolute):** keep only teams in the
   **top half** of the league by championship futures (implied-probability rank) OR current
   power/standings rank. Use rank, NOT an absolute probability, because championship-
   probability scale varies wildly by league parity (see research below): the NFL's most
   likely champion is ~14%, while NBA champions are routinely 50–65% favorites. Tighten to
   **top third for the NBA** (chalk league — champions are rarely longshots).
3. **Secondary floor (LOW): ≥ 5% implied championship probability.** Drops true no-hopers
   only. NOTE: an earlier 8% floor was rejected — it would have excluded ~30% of the last 40
   champions, including the best value stories. 5% excludes only ~12.5%; 8% excludes ~30%.
4. Among the qualified pool, pick the **best edge** (highest `champ_ev_pct`, i.e. model/
   prediction-market vs de-vigged sportsbook). Tie-break by higher win probability.

**Supporting research — preseason odds of last 10 champions per league (SportsOddsHistory):**
- % of champions whose PRESEASON implied probability was below each candidate floor (of 40):
  **< 8% → 30% of champions** (too aggressive) · **< 5% → 12.5%** · **< 3% → 7.5%**.
- Median champion preseason implied prob: NBA ~17.5%, NFL ~9.1%, NHL ~8.3%, MLB ~9.1%.
- Parity contrast (max champ prob in 10 yrs): NFL 14.3% vs NBA 65.2% → confirms a single
  absolute floor is wrong; rank-based filter adapts per league.
- Accept that ~1 in 10 champions is an uncatchable longshot (e.g. TEX +5000, SEA +6000) —
  fine for a curated parlay optimizing realistic value, not miracles.
5. Combine the 4 legs: multiply de-vigged probabilities → combined implied probability;
   multiply decimal odds → combined payout; show parlay EV.

**Design / product considerations (open to feedback):**
- **Timing mismatch:** the four titles resolve at different times (NBA/NHL ~Jun, MLB ~Nov,
  NFL ~Feb). A real cross-sport futures parlay is long-dated and most books won't combine
  it on one slip — so present it primarily as a *published model portfolio* / shareable
  card, not necessarily a one-click bet.
- **"Quarterly":** regenerate each quarter (or on a cadence) as futures move; archive past
  parlays to show a track record (ties into CLV/credibility).
- **Premium vs social:** could gate the live pick behind a premium tier while posting a
  teaser card to socials. Shareable card art should be designed alongside the Phase 5
  refresh, not bolted on.

**Data dependencies:**
- Year-round championship futures (sportsbook + Kalshi) for ALL four leagues, including
  off-season ones. The off-season market-only mode already does this for NFL via
  `marketNameMap` — would need the same wiring for the other leagues when between seasons.
- "Top half" ranking can be derived from the futures implied-probability rank itself
  (rank teams by implied champ prob, keep those above the median) — no extra source needed.
  For in-season leagues, current standings/power rank is an alternative input.

**Requirements / tasks:**
- New computation (sim script or a small dedicated job) producing the 4 picks + combined
  odds/EV; store in a new `parlay` table (or a JSON blob keyed by quarter).
- New page/section + a generated shareable image card.
- Decide premium gating mechanism (out of scope until monetization is on the roadmap).

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
│   ├── espn.ts                 # ESPN Core API: standings + upcoming games + playoff state
│   ├── simulation.ts           # Monte Carlo engine (50k sims, sport-specific seeding/brackets)
│   ├── odds.ts                 # The Odds API — de-vigged championship %
│   ├── kalshi.ts               # Kalshi — field-normalized championship %
│   └── supabase.ts             # Anon client helpers (NEXT_PUBLIC_ vars, browser-safe)
├── components/
│   ├── LeagueCard.tsx          # Home page card: IN SEASON / FUTURES / OFF SEASON badge
│   ├── StandingsTable.tsx      # Sortable table, sparklines, market edge columns
│   ├── Sparkline.tsx           # Inline SVG sparkline component
│   ├── SeedChart.tsx           # Recharts bar chart (client-only, dynamic import)
│   └── ScheduleTable.tsx       # Upcoming games + win probability per game
└── app/
    ├── layout.tsx              # Dark bg, sticky header, footer
    ├── page.tsx                # Home: league grid (client component)
    ├── globals.css             # Tailwind base + dark scrollbar
    ├── [league]/
    │   ├── page.tsx            # League page server component (generateStaticParams)
    │   └── LeaguePageClient.tsx # Standings table + sparklines
    └── [league]/[team]/
        └── page.tsx            # Team detail: stat cards, edge card, seed chart, schedule
```

---

## Common Commands

```bash
# Local dev
npm run dev

# Build check (requires NEXT_PUBLIC_* env vars)
NEXT_PUBLIC_SUPABASE_URL=xxx NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx npm run build

# Run sim locally (writes to Supabase)
SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx npx tsx scripts/simulate.ts

# Trigger sim via GitHub CLI
gh workflow run simulate.yml

# Watch sim run
gh run watch <run-id> --exit-status

# Push to GitHub (triggers deploy)
git add -A && git commit -m "message" && git push

# Test ESPN core API directly
curl -s "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/groups?limit=5"
```
