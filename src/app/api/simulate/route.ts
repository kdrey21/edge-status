import { NextRequest, NextResponse } from 'next/server'
import { LEAGUES } from '@/types'
import { fetchStandings, fetchUpcomingGames, isLeagueActive } from '@/lib/espn'
import { runSimulation } from '@/lib/simulation'
import { getServiceClient } from '@/lib/supabase'

export const maxDuration = 300 // 5 min — Vercel Pro limit; free tier caps at 10s (hobby)
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? ''
  const secret = process.env.CRON_SECRET
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()
  const results: { league: string; teams: number; status: string }[] = []

  await Promise.all(
    LEAGUES.map(async (league) => {
      try {
        const [teams, espnGames] = await Promise.all([
          fetchStandings(league.espnPath, league.totalGames, league.coreLeague),
          fetchUpcomingGames(league.espnPath),
        ])

        if (!isLeagueActive(teams)) {
          results.push({
            league: league.slug,
            teams: teams.length,
            status: `inactive (fetched ${teams.length} teams, none with games played)`,
          })
          return
        }

        const simResults = runSimulation(
          teams,
          espnGames,
          league.slug,
          league.playoffTeamsPerConference,
        )

        // Build a lookup map for current standings (wins/losses/GB)
        const standingsMap = new Map(teams.map(t => [t.abbreviation, t]))

        // Upsert results — one row per team per league
        const rows = simResults.map((r) => {
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
            implied_playoff_pct: null,
            edge_pct: null,
            updated_at: new Date().toISOString(),
          }
        })

        const { error } = await db
          .from('sim_results')
          .upsert(rows, { onConflict: 'team,league' })

        if (error) throw error

        results.push({ league: league.slug, teams: rows.length, status: 'ok' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        results.push({ league: league.slug, teams: 0, status: `error: ${msg}` })
      }
    }),
  )

  return NextResponse.json({ ok: true, results })
}
