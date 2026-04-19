# EdgeStatus

Public, read-only sports playoff probability app powered by 50,000 Monte Carlo simulations per league. Built with Next.js 14, Supabase, and Vercel.

## Prerequisites

- Node 18+
- [Supabase](https://supabase.com) account (free tier)
- [Vercel](https://vercel.com) account (free tier)

## Database Setup

In your Supabase project, open the SQL editor and run:

```sql
create table sim_results (
  id uuid primary key default gen_random_uuid(),
  team text not null,
  league text not null,
  playoff_pct numeric,
  div_title_pct numeric,
  conf_title_pct numeric,
  championship_pct numeric,
  seed_distribution jsonb,
  magic_number int,
  elim_number int,
  updated_at timestamptz default now(),
  unique (team, league)
);
```

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

| Variable | Where to find it |
|---|---|
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API → Project URL |
| `SUPABASE_ANON_KEY` | Supabase dashboard → Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Project Settings → API → service_role key |
| `CRON_SECRET` | Generate below |


### Generate a CRON_SECRET

```bash
openssl rand -hex 32
```

## Local Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add all four environment variables in **Vercel → Project → Settings → Environment Variables**.
4. Deploy:

```bash
vercel --prod
```

The Vercel cron job (`vercel.json`) will trigger `/api/simulate` daily at 06:00 UTC automatically on paid plans. On the Hobby (free) tier, trigger it manually (see below).

## Manually Trigger a Simulation

```bash
curl -H "Authorization: Bearer <your-CRON_SECRET>" \
  https://your-app.vercel.app/api/simulate
```

Replace `<your-CRON_SECRET>` with the value you generated, and `your-app.vercel.app` with your actual deployment URL.

Expected response:

```json
{
  "ok": true,
  "results": [
    { "league": "nba", "teams": 30, "status": "ok" },
    { "league": "nhl", "teams": 32, "status": "ok" },
    ...
  ]
}
```

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # Home — league cards
│   ├── [league]/page.tsx         # Standings + playoff odds table
│   ├── [league]/[team]/page.tsx  # Team detail: seed chart, schedule
│   └── api/simulate/route.ts    # Cron endpoint (secured)
├── components/
│   ├── LeagueCard.tsx
│   ├── StandingsTable.tsx
│   ├── SeedChart.tsx             # Recharts bar chart (client)
│   └── ScheduleTable.tsx
├── lib/
│   ├── espn.ts                   # ESPN unofficial API (no key needed)
│   ├── simulation.ts             # Monte Carlo engine (50k sims)
│   └── supabase.ts               # DB client (anon + service role)
└── types/index.ts
```

## Data Sources

- **Standings & schedule**: [ESPN unofficial API](https://site.api.espn.com/apis/site/v2/sports/) — no API key required.
- **No paid APIs** used in v1.

## Leagues

| League | ESPN path |
|--------|-----------|
| NBA | `basketball/nba` |
| NHL | `hockey/nhl` |
| MLB | `baseball/mlb` |
| NFL | `football/nfl` |
| MLS | `soccer/usa.1` |
