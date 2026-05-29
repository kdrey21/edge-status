/**
 * Daily simulation script — run by GitHub Actions (simulate.yml).
 *
 * Usage:
 *   npx tsx scripts/simulate.ts
 *
 * Required env vars:
 *   SUPABASE_URL               — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role key (write access)
 */

import { createClient } from '@supabase/supabase-js'
import { LEAGUES } from '@/types'
import { fetchStandings, fetchUpcomingGames, isLeagueActive } from '@/lib/espn'
import { runSimulation } from '@/lib/simulation'

// Validate secrets before doing any work
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing required env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY',
  )
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  console.log(`\n🏆 EdgeStatus simulation run — ${new Date().toISOString()}\n`)

  const results: { league: string; teams: number; status: string }[] = []

  await Promise.all(
    LEAGUES.map(async league => {
      try {
        console.log(`  [${league.slug.toUpperCase()}] Fetching standings…`)

        const [teams, espnGames] = await Promise.all([
          fetchStandings(league.espnPath, league.totalGames, league.coreLeague),
          fetchUpcomingGames(league.espnPath),
        ])

        if (!isLeagueActive(teams)) {
          console.log(
            `  [${league.slug.toUpperCase()}] Inactive — ${teams.length} teams, no games played`,
          )
          results.push({
            league: league.slug,
            teams: teams.length,
            status: `inactive (fetched ${teams.length} teams, none with games played)`,
          })
          return
        }

        console.log(
          `  [${league.slug.toUpperCase()}] Running sim for ${teams.length} teams…`,
        )

        const simResults = runSimulation(
          teams,
          espnGames,
          league.slug,
          league.playoffTeamsPerConference,
        )

        // Build a lookup map for current standings (wins/losses/GB)
        const standingsMap = new Map(teams.map(t => [t.abbreviation, t]))

        const rows = simResults.map(r => {
          const standing = standingsMap.get(r.team)
          return {
            team: r.team,
            league: r.league,
            wins: standing?.wins ?? 0,
            losses: standing?.losses ?? 0,
            games_back: standing?.gamesBack ?? 0,
            playoff_pct: r.playoff_pct,
            div_title_pct: r.div_title_pct,
            conf_title_pct: r.conf_title_pct,
            championship_pct: r.championship_pct,
            seed_distribution: r.seed_distribution,
            magic_number: r.magic_number,
            elim_number: r.elim_number,
            // Phase 3: will be populated when Kalshi + Odds API wired
            implied_playoff_pct: null,
            edge_pct: null,
            updated_at: new Date().toISOString(),
          }
        })

        const { error } = await db
          .from('sim_results')
          .upsert(rows, { onConflict: 'team,league' })

        if (error) throw error

        console.log(
          `  [${league.slug.toUpperCase()}] ✓ ${rows.length} teams upserted`,
        )
        results.push({ league: league.slug, teams: rows.length, status: 'ok' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error(`  [${league.slug.toUpperCase()}] ✗ Error: ${msg}`)
        results.push({ league: league.slug, teams: 0, status: `error: ${msg}` })
      }
    }),
  )

  console.log('\n📊 Results summary:')
  console.log(JSON.stringify({ ok: true, results }, null, 2))

  const errors = results.filter(r => r.status.startsWith('error'))
  if (errors.length > 0) {
    console.error(`\n⚠️  ${errors.length} league(s) failed`)
    process.exit(1)
  }

  console.log('\n✅ Simulation complete')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
