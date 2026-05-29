# EdgeStatus

Public, read-only sports playoff probability app powered by 50,000 Monte Carlo simulations per league. Shows real-time standings, playoff odds, seed distributions, and (v2) betting edge vs. the market.

**Live:** https://your-app.vercel.app  
**Stack:** Next.js 14 · Supabase · Vercel · cron-job.org  
**Cost:** $0–$5/month (free tier everything + optional Odds API)

---

## How It Works

1. **Daily at 06:00 UTC** — cron-job.org calls `/api/simulate`
2. ESPN Core API is queried for current standings and schedules
3. Elo ratings are computed from win/loss records
4. 50,000 Monte Carlo simulations run server-side for each active league
5. Results are upserted into Supabase
6. The Next.js frontend reads from Supabase (anon key, public read)

---

## Prerequisites

- Node 18+
- [Supabase](https://supabase.com) account — free tier
- [Vercel](https://vercel.com) account — free Hobby tier
- [cron-job.org](https://cron-job.org) account — free
- *(Optional v2)* [The Odds API](https://the-odds-api.com) key — $5/mo Basic plan

---

## Database Setup

In your Supabase project → **SQL Editor**, run the full schema:

```sql
-- Main table: one row per team per league, upserted on each sim run
create table sim_results (
  id                  uuid primary key default gen_random_uuid(),
  team                text not null,
  league              text not null,
  wins                int default 0,
  losses              int default 0,
  games_back          numeric default 0,
  playoff_pct         numeric,
  div_title_pct       numeric,
  conf_title_pct      numeric,
  championship_pct    numeric,
  seed_distribution   jsonb,
  magic_number        int,
  elim_number         int,
  implied_playoff_pct numeric,      -- v2: from betting odds
  edge_pct            numeric,      -- v2: our % minus implied %
  updated_at          timestamptz default now(),
  unique (team, league)
);

-- Allow public reads (anon key) — this is a public read-only app
alter table sim_results enable row level security;
create policy "Public read" on sim_results for select using (true);
```

---

## Environment Variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key |
| `CRON_SECRET` | Generate with `openssl rand -hex 32` |
| `ODDS_API_KEY` | *(v2 only)* the-odds-api.com dashboard |

Add all variables in **Vercel → Project → Settings → Environment Variables** (set all environments: Production, Preview, Development).

---

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The home page will show leagues as inactive until you trigger a sim run (see below).

---

## Deploy to Vercel

```bash
# 1. Push to GitHub
git add -A && git commit -m "deploy" && git push

# 2. Import in Vercel dashboard → set env vars → Deploy
# Or via CLI:
vercel --prod
```

Vercel auto-deploys on every push to `main`.

---

## Automated Daily Sim — cron-job.org (Free)

> **Do not rely on `vercel.json` crons** — those require the Vercel Pro plan ($20/mo). Use cron-job.org instead (free).

1. Sign up at [cron-job.org](https://cron-job.org)
2. **Dashboard → Create cronjob**
3. Settings:
   - **URL:** `https://your-app.vercel.app/api/simulate`
   - **Schedule:** Custom → `0 6 * * *` (daily 6:00 AM UTC)
   - **Request method:** GET
   - **Request headers:** Add one header:
     - Name: `Authorization`
     - Value: `Bearer YOUR_CRON_SECRET`
4. Save and enable

The sim will now run automatically every morning. You can also hit **Run now** from the cron-job.org dashboard to trigger it manually.

---

## Manually Trigger a Sim

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/simulate
```

Expected response:
```json
{
  "ok": true,
  "results": [
    { "league": "nba", "teams": 30, "status": "ok" },
    { "league": "nhl", "teams": 32, "status": "ok" },
    { "league": "mlb", "teams": 30, "status": "ok" },
    { "league": "nfl", "teams": 0,  "status": "inactive (off-season)" },
    { "league": "mls", "teams": 0,  "status": "inactive (off-season)" }
  ]
}
```

Leagues show `inactive` when ESPN returns no current season data (off-season). This is expected.

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                    # Home — league cards (active/inactive)
│   ├── [league]/page.tsx           # Standings table with playoff odds
│   ├── [league]/[team]/page.tsx    # Team detail: seed chart + schedule
│   └── api/
│       └── simulate/route.ts       # POST endpoint secured by CRON_SECRET
├── components/
│   ├── LeagueCard.tsx              # Card with active/inactive badge
│   ├── StandingsTable.tsx          # Sortable table, color-coded percentages
│   ├── SeedChart.tsx               # Recharts bar chart (client component)
│   └── ScheduleTable.tsx           # Upcoming games + per-game win prob
├── lib/
│   ├── espn.ts                     # ESPN Core API client (no key needed)
│   ├── simulation.ts               # 50k Monte Carlo engine + Elo ratings
│   └── supabase.ts                 # Lazy anon client + service role client
└── types/index.ts                  # Shared types + LEAGUES config
```

---

## Data Sources

| Source | Used for | Cost |
|---|---|---|
| [ESPN Core API](https://sports.core.api.espn.com) | Standings, schedules, scores | Free |
| [Supabase](https://supabase.com) | Storing sim results | Free |
| [The Odds API](https://the-odds-api.com) | Betting odds (v2 edge finder) | $5/mo |

> **Why ESPN Core API?** The standard `site.api.espn.com/standings` endpoint returns a stub (`{"fullViewLink":...}`) during and after playoffs. The core API (`sports.core.api.espn.com`) returns full season standings reliably year-round.

---

## Active Leagues

| League | ESPN Core path | Season type |
|---|---|---|
| NBA | `basketball/nba` | Oct–Jun |
| NHL | `hockey/nhl` | Oct–Jun |
| MLB | `baseball/mlb` | Mar–Oct |
| NFL | `football/nfl` | Sep–Feb |
| MLS | `soccer/mls` | Mar–Nov |

Leagues are automatically marked inactive when ESPN returns no standings data for the current season. No config change needed — it just works.

---

## Cost Breakdown

| Service | Plan | Monthly cost |
|---|---|---|
| Vercel | Hobby (free) | $0 |
| Supabase | Free tier | $0 |
| cron-job.org | Free | $0 |
| ESPN API | Unofficial, no key | $0 |
| The Odds API | Basic (v2 only) | $5 |
| **Total** | | **$0 (v1) / $5 (v2)** |

---

## Roadmap

### v1 — Live ✓
- [x] Monte Carlo sim (50,000 iterations per league)
- [x] Playoff %, Division Title %, Championship % per team
- [x] Seed probability distribution (bar chart)
- [x] Upcoming schedule with per-game win probability
- [x] Magic number and elimination number
- [x] Daily automated sim via cron-job.org
- [x] Dark mode, mobile responsive

### v2 — Next ($5/mo unlock)
- [ ] Betting edge finder — our sim % vs. implied odds %
- [ ] Edge column in standings table (already wired, needs `ODDS_API_KEY`)
- [ ] Color-coded edge badges on team detail page

### v3 — Future (no additional cost)
- [ ] 14-day playoff % trend sparklines (requires history table)
- [ ] Push notifications when a team's odds shift >10%
- [ ] Shareable team cards for social

---

## Troubleshooting

**All leagues show "OFF SEASON" after a sim run**
→ Supabase RLS is blocking reads. Run in SQL editor:
```sql
create policy "Public read" on sim_results for select using (true);
```

**Sim returns `"teams": 0` for a league**
→ ESPN returned no standings data. Could be off-season or a temporary outage. Check manually:
```bash
curl -s "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/groups?limit=5"
```

**Vercel function times out**
→ Free Hobby tier caps functions at 10 seconds — not enough for 5 leagues × 50k sims. Options:
1. Reduce `N_SIMS` in `src/lib/simulation.ts` from `50_000` to `10_000` for testing
2. Upgrade to Vercel Pro ($20/mo) for 5-minute limit
3. Run sim from your local machine with the curl command above — results still write to Supabase

**Push rejected (fetch first)**
```bash
git pull --rebase && git push
```

**Deployment blocked: commit author email not valid**
```bash
git config --global user.email "your@email.com"
git commit --amend --reset-author --no-edit
git push --force
```
