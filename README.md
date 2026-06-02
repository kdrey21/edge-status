# EdgeStatus

Public, read-only sports playoff probability app powered by 50,000 Monte Carlo simulations per league. Shows real-time standings, playoff odds, seed distributions, and market edge vs. sportsbook implied odds.

**Live:** https://kdrey21.github.io/edge-status  
**Stack:** Next.js 14 · Supabase · GitHub Pages · GitHub Actions  
**Cost:** $0/month (free tier everything)

---

## How It Works

1. **Daily at 06:00 UTC** — GitHub Actions runs `scripts/simulate.ts`
2. ESPN Core API is queried for current standings and schedules
3. Elo ratings are computed from win/loss records
4. 50,000 Monte Carlo simulations run for each active league
5. Kalshi prediction market odds + sportsbook de-vigged odds are fetched
6. Results are upserted into Supabase
7. The Next.js frontend is exported as static HTML and deployed to GitHub Pages

---

## Prerequisites

- Node 18+
- [Supabase](https://supabase.com) account — free tier
- *(Optional)* [The Odds API](https://the-odds-api.com) key — free tier (500 credits/month)
- *(Optional)* [Kalshi](https://kalshi.com) read-only API token — free

---

## Database Setup

In your Supabase project → **SQL Editor**, run:

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
  implied_playoff_pct  numeric,
  edge_pct             numeric,
  updated_at           timestamptz default now(),
  unique (team, league)
);

alter table sim_results enable row level security;
create policy "Public read" on sim_results for select using (true);
```

---

## Environment Variables

Create `.env` at the repo root (never committed — it's in `.gitignore`):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ODDS_API_KEY=your-odds-api-key
KALSHI_API_TOKEN=your-kalshi-bearer-token
```

Add the same values as **GitHub Actions secrets** (repo → Settings → Secrets → Actions) using a single secret named `EDGE_STATUS_ENV` containing all lines above.

---

## Local Development

```bash
npm install
npm run dev        # http://localhost:3000/edge-status
```

Run the sim locally (writes to Supabase):
```bash
npx tsx scripts/simulate.ts
```

---

## Deployment

Pushing to `main` automatically triggers two GitHub Actions workflows:

- **`deploy-pages.yml`** — builds the static export and deploys to GitHub Pages
- **`simulate.yml`** — runs daily at 06:00 UTC (also triggerable manually from the Actions tab)

GitHub Pages must be enabled: repo → Settings → Pages → Source: **GitHub Actions**

---

## Architecture

```
.github/workflows/
├── simulate.yml          # Daily sim → Supabase
└── deploy-pages.yml      # Static export → GitHub Pages
scripts/
└── simulate.ts           # Standalone sim script (Node/tsx)
src/
├── app/
│   ├── page.tsx                       # Home — league cards
│   ├── [league]/
│   │   ├── page.tsx                   # Server component (generateStaticParams)
│   │   └── LeaguePageClient.tsx       # Standings table
│   └── [league]/[team]/
│       ├── page.tsx                   # Server component (generateStaticParams)
│       └── TeamPageClient.tsx         # Team detail: stats, edge card, schedule
├── components/
│   ├── LeagueCard.tsx                 # Home page card
│   ├── StandingsTable.tsx             # Sortable table with market edge columns
│   ├── SeedChart.tsx                  # Recharts seed distribution chart
│   └── ScheduleTable.tsx             # Upcoming games + win probability
└── lib/
    ├── espn.ts                        # ESPN Core API client
    ├── simulation.ts                  # 50k Monte Carlo engine
    ├── odds.ts                        # The Odds API — de-vigged championship %
    ├── kalshi.ts                      # Kalshi — field-normalized championship %
    └── supabase.ts                    # Anon client (browser-safe)
```

---

## Data Sources

| Source | Used for | Cost |
|---|---|---|
| [ESPN Core API](https://sports.core.api.espn.com) | Standings, schedules | Free |
| [Supabase](https://supabase.com) | Storing sim results | Free |
| [Kalshi](https://kalshi.com) | Prediction market reference price | Free |
| [The Odds API](https://the-odds-api.com) | Sportsbook de-vigged implied odds | Free tier |

---

## Active Leagues

| League | Kalshi Series | Season |
|---|---|---|
| NBA | KXNBA | Oct–Jun |
| NHL | KXNHL | Oct–Jun |
| MLB | KXMLB | Mar–Oct |
| NFL | KXSB | Sep–Feb |
| MLS | — | Mar–Nov |

---

## Cost Breakdown

| Service | Plan | Monthly cost |
|---|---|---|
| GitHub Pages | Free | $0 |
| GitHub Actions | Free tier | $0 |
| Supabase | Free tier | $0 |
| ESPN API | Unofficial, no key | $0 |
| Kalshi API | Free read-only token | $0 |
| The Odds API | Free tier (500 credits/mo) | $0 |
| **Total** | | **$0** |

---

## Troubleshooting

**All leagues show "OFF SEASON"**  
→ Supabase RLS is blocking reads. Run in SQL editor:
```sql
create policy "Public read" on sim_results for select using (true);
```

**Sim returns `"teams": 0` for a league**  
→ ESPN returned no standings — likely off-season or a temporary outage. Check:
```bash
curl -s "https://sports.core.api.espn.com/v2/sports/baseball/leagues/mlb/seasons/2026/types/2/groups?limit=5"
```

**Market columns show `—` for all teams**  
→ `ODDS_API_KEY` or `KALSHI_API_TOKEN` not set, or the league's season hasn't started yet (NFL off-season). Sim still runs fine without them.

**Push rejected (remote ahead)**  
```bash
git pull --rebase && git push
```
