/**
 * Daily simulation script — run by GitHub Actions (simulate.yml).
 *
 * Usage:
 *   npx tsx scripts/simulate.ts
 *
 * Required env vars:
 *   SUPABASE_URL               — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service-role key (write access)
 *
 * Optional env vars (Phase 3 market edge — leave unset to skip):
 *   ODDS_API_KEY               — The Odds API key (https://the-odds-api.com)
 *   KALSHI_API_TOKEN           — Kalshi read-only Bearer token (kalshi.com → Settings → API)
 */

import { createClient } from '@supabase/supabase-js'
import { LEAGUES } from '@/types'
import { fetchStandings, fetchUpcomingGames, fetchCompletedGames, isLeagueActive, fetchPlayoffAliveTeamIds } from '@/lib/espn'
import { runSimulation, buildH2HMatrix, type TrackedGameInput } from '@/lib/simulation'
import { fetchSportsbookChampionshipOdds } from '@/lib/odds'
import { fetchKalshiChampionshipOdds } from '@/lib/kalshi'

// Validate required secrets before doing any work
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    'Missing required env vars: SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY',
  )
  process.exit(1)
}

// Optional — market edge columns are skipped if keys are absent
const ODDS_API_KEY = process.env.ODDS_API_KEY ?? null
const KALSHI_API_TOKEN = process.env.KALSHI_API_TOKEN ?? null

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

/**
 * Match a full team name (from a market) to the closest team abbreviation
 * in our ESPN standings data.
 *
 * Strategy:
 *   1. Exact match on displayName (lowercase)
 *   2. Exact match on name (nickname only, lowercase)
 *   3. Market name contains team's city/nickname or vice versa
 *
 * Returns the team's abbreviation (uppercased) or null if no match found.
 */
function matchMarketName(
  marketName: string,
  teams: Array<{ abbreviation: string; name: string; displayName: string }>,
): string | null {
  const mn = marketName.toLowerCase().trim()

  for (const t of teams) {
    if (t.displayName.toLowerCase() === mn) return t.abbreviation
  }
  for (const t of teams) {
    if (t.name.toLowerCase() === mn) return t.abbreviation
  }
  // Partial: market name includes our team name or vice versa
  for (const t of teams) {
    const dn = t.displayName.toLowerCase()
    const nn = t.name.toLowerCase()
    if (mn.includes(nn) || nn.includes(mn)) return t.abbreviation
    if (mn.includes(dn) || dn.includes(mn)) return t.abbreviation
  }
  return null
}

async function main() {
  console.log(`\n🏆 EdgeStatus simulation run — ${new Date().toISOString()}\n`)

  const hasOddsKey = Boolean(ODDS_API_KEY)
  const hasKalshiKey = Boolean(KALSHI_API_TOKEN)
  console.log(
    `  Market data: Odds API=${hasOddsKey ? '✓' : '✗ (skipped)'}  Kalshi=${hasKalshiKey ? '✓' : '✗ (skipped)'}\n`,
  )

  const results: { league: string; teams: number; status: string }[] = []

  await Promise.all(
    LEAGUES.map(async league => {
      try {
        console.log(`  [${league.slug.toUpperCase()}] Fetching standings…`)

        const [teams, espnGames, completedGames] = await Promise.all([
          fetchStandings(league.espnPath, league.totalGames, league.coreLeague, league.coreSeasonType),
          fetchUpcomingGames(league.espnPath),
          fetchCompletedGames(league.espnPath),
        ])

        const h2hMatrix = buildH2HMatrix(completedGames)
        console.log(
          `  [${league.slug.toUpperCase()}] H2H matrix: ${completedGames.length} completed games → ${h2hMatrix.size} teams with wins`,
        )

        if (!isLeagueActive(teams)) {
          // Off-season: skip simulation, but still fetch market futures if configured
          const canFetchOffSeasonMarkets =
            hasOddsKey && hasKalshiKey &&
            league.oddsApiSport != null &&
            league.kalshiSeries != null &&
            league.marketNameMap != null

          if (!canFetchOffSeasonMarkets) {
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

          console.log(`  [${league.slug.toUpperCase()}] Off-season — fetching futures market data…`)
          const [oddsResult, kalshiResult] = await Promise.allSettled([
            fetchSportsbookChampionshipOdds(league.oddsApiSport!, ODDS_API_KEY!),
            fetchKalshiChampionshipOdds(league.kalshiSeries!, KALSHI_API_TOKEN!),
          ])
          const oddsMap = oddsResult.status === 'fulfilled' ? oddsResult.value : new Map<string, number>()
          const kalshiMap = kalshiResult.status === 'fulfilled' ? kalshiResult.value : new Map<string, number>()
          console.log(
            `  [${league.slug.toUpperCase()}] Odds=${oddsMap.size} teams  Kalshi=${kalshiMap.size} teams`,
          )

          const nameMap = league.marketNameMap!
          const rows: object[] = []

          for (const abbr of league.teams) {
            // Find the market name key(s) that map to this abbreviation
            const marketKeys = Object.entries(nameMap)
              .filter(([, v]) => v === abbr)
              .map(([k]) => k)

            let kalshi_champ_pct: number | null = null
            let sportsbook_champ_pct: number | null = null

            for (const key of marketKeys) {
              if (kalshi_champ_pct == null) {
                for (const [mk, mv] of kalshiMap) {
                  if (mk.includes(key) || key.includes(mk)) {
                    kalshi_champ_pct = mv; break
                  }
                }
              }
              if (sportsbook_champ_pct == null) {
                for (const [ok, ov] of oddsMap) {
                  if (ok.includes(key) || key.includes(ok)) {
                    sportsbook_champ_pct = ov; break
                  }
                }
              }
            }

            // Only upsert teams found in at least one market
            if (kalshi_champ_pct == null && sportsbook_champ_pct == null) continue

            const champ_ev_pct =
              kalshi_champ_pct != null && sportsbook_champ_pct != null
                ? kalshi_champ_pct - sportsbook_champ_pct
                : null

            rows.push({
              team: abbr,
              league: league.slug,
              wins: null,
              losses: null,
              games_back: null,
              playoff_pct: null,
              div_title_pct: null,
              conf_title_pct: null,
              championship_pct: null,
              seed_distribution: null,
              magic_number: null,
              elim_number: null,
              kalshi_champ_pct,
              sportsbook_champ_pct,
              champ_ev_pct,
              implied_playoff_pct: null,
              edge_pct: null,
              updated_at: new Date().toISOString(),
            })
          }

          if (rows.length > 0) {
            const { error } = await db
              .from('sim_results')
              .upsert(rows, { onConflict: 'team,league' })
            if (error) throw error

            // Snapshot for history / sparklines (Phase 4)
            const snapDate = new Date().toISOString().split('T')[0]
            const snapRows = (rows as any[]).map(r => ({
              team: r.team,
              league: r.league,
              snap_date: snapDate,
              playoff_pct: r.playoff_pct,
              div_title_pct: r.div_title_pct,
              championship_pct: r.championship_pct,
              kalshi_champ_pct: r.kalshi_champ_pct,
              sportsbook_champ_pct: r.sportsbook_champ_pct,
              champ_ev_pct: r.champ_ev_pct,
            }))
            const { error: snapErr } = await db
              .from('sim_snapshots')
              .upsert(snapRows, { onConflict: 'team,league,snap_date' })
            if (snapErr) console.warn(`  [${league.slug.toUpperCase()}] Snapshot write failed: ${snapErr.message}`)
          }

          const edgeTeams = (rows as any[]).filter(r => r.champ_ev_pct != null && r.champ_ev_pct > 5)
          console.log(
            `  [${league.slug.toUpperCase()}] ✓ ${rows.length} market-only rows upserted` +
            (edgeTeams.length > 0
              ? ` | 🎯 ${edgeTeams.length} VALUE: ${edgeTeams.map((r: any) => `${r.team} +${r.champ_ev_pct.toFixed(1)}%`).join(', ')}`
              : ''),
          )
          results.push({ league: league.slug, teams: rows.length, status: 'market-only' })
          return
        }

        console.log(
          `  [${league.slug.toUpperCase()}] Running sim for ${teams.length} teams…`,
        )

        // Build tracked games: upcoming games in next 21 days
        // (MLS plays ~weekly so 14 days can fall entirely between matchdays)
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() + 21)
        const idToAbbr = new Map(teams.map(t => [t.id, t.abbreviation]))
        const trackedGames: TrackedGameInput[] = espnGames
          .filter(g => !g.completed && new Date(g.date) <= cutoffDate)
          .filter(g => idToAbbr.has(g.homeTeamId) && idToAbbr.has(g.awayTeamId))
          .slice(0, 60)
          .map(g => ({
            homeTeamId: g.homeTeamId,
            awayTeamId: g.awayTeamId,
            date: g.date.slice(0, 10),
            homeTeamAbbr: idToAbbr.get(g.homeTeamId)!,
            awayTeamAbbr: idToAbbr.get(g.awayTeamId)!,
          }))

        const { results: simResults, gameImportance } = runSimulation(
          teams,
          espnGames,
          league.slug,
          league.playoffTeamsPerConference,
          league.sport,
          trackedGames,
          h2hMatrix,
        )

        // -------------------------------------------------------------------
        // Phase 3: Market edge = Kalshi % vs Sportsbook de-vigged %
        // EV% = kalshi_champ_pct − sportsbook_champ_pct
        // Positive = sportsbook is undervaluing the team vs prediction market
        // -------------------------------------------------------------------
        let oddsMap = new Map<string, number>()
        let kalshiMap = new Map<string, number>()

        const canFetchMarkets =
          hasOddsKey && hasKalshiKey &&
          league.oddsApiSport != null &&
          league.kalshiSeries != null

        if (canFetchMarkets) {
          console.log(`  [${league.slug.toUpperCase()}] Fetching market data…`)
          const [oddsResult, kalshiResult] = await Promise.allSettled([
            fetchSportsbookChampionshipOdds(league.oddsApiSport!, ODDS_API_KEY!),
            fetchKalshiChampionshipOdds(league.kalshiSeries!, KALSHI_API_TOKEN!),
          ])
          if (oddsResult.status === 'fulfilled') oddsMap = oddsResult.value
          if (kalshiResult.status === 'fulfilled') kalshiMap = kalshiResult.value
          console.log(
            `  [${league.slug.toUpperCase()}] Odds=${oddsMap.size} teams  Kalshi=${kalshiMap.size} teams`,
          )
        }

        // Build a lookup map for current standings (wins/losses/GB)
        const standingsMap = new Map(teams.map(t => [t.abbreviation, t]))

        const rows = simResults.map(r => {
          const standing = standingsMap.get(r.team)

          // Match market prices to this team
          const teamMeta = standing
            ? { abbreviation: standing.abbreviation, name: standing.name, displayName: standing.displayName }
            : null

          let kalshi_champ_pct: number | null = null
          let sportsbook_champ_pct: number | null = null
          let champ_ev_pct: number | null = null

          if (teamMeta && canFetchMarkets) {
            const kalshiEntry = findInMap(kalshiMap, teamMeta)
            const oddsEntry = findInMap(oddsMap, teamMeta)
            if (kalshiEntry != null) kalshi_champ_pct = kalshiEntry
            if (oddsEntry != null) sportsbook_champ_pct = oddsEntry
            if (kalshi_champ_pct != null && sportsbook_champ_pct != null) {
              champ_ev_pct = kalshi_champ_pct - sportsbook_champ_pct
            }
          }

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
            kalshi_champ_pct,
            sportsbook_champ_pct,
            champ_ev_pct,
            // Legacy columns — kept for schema compat, no longer meaningful
            implied_playoff_pct: null,
            edge_pct: null,
            updated_at: new Date().toISOString(),
          }
        })

        // -------------------------------------------------------------------
        // Playoff state adjustment
        // When the regular season is over (0 games remaining), the Monte Carlo
        // sim runs the full playoff bracket from scratch — it doesn't know which
        // teams have already been eliminated. Fix this by fetching the ESPN
        // postseason scoreboard and zeroing out championship/conf odds for any
        // team that no longer has a scheduled playoff game.
        // -------------------------------------------------------------------
        const totalGamesRemaining = teams.reduce((s, t) => s + t.gamesRemaining, 0)
        if (totalGamesRemaining === 0) {
          const aliveIds = await fetchPlayoffAliveTeamIds(league.espnPath)
          if (aliveIds.size > 0) {
            const idToAbbr = new Map(teams.map(t => [t.id, t.abbreviation]))
            const aliveAbbrs = new Set(
              [...aliveIds].map(id => idToAbbr.get(id)).filter((a): a is string => a != null),
            )

            console.log(
              `  [${league.slug.toUpperCase()}] Playoff mode — ${aliveAbbrs.size} alive: ${[...aliveAbbrs].sort().join(', ')}`,
            )

            // Zero out eliminated teams
            for (const row of rows) {
              if (!aliveAbbrs.has(row.team)) {
                row.championship_pct = 0
                row.conf_title_pct = 0
              }
            }

            // Renormalize championship_pct so alive teams sum to 100%
            const totalChamp = rows
              .filter(r => aliveAbbrs.has(r.team))
              .reduce((s, r) => s + r.championship_pct, 0)
            if (totalChamp > 0) {
              for (const row of rows) {
                if (aliveAbbrs.has(row.team)) {
                  row.championship_pct = (row.championship_pct / totalChamp) * 100
                }
              }
            }

            // Renormalize conf_title_pct per conference among alive teams
            const teamConf = new Map(teams.map(t => [t.abbreviation, t.conference]))
            const conferences = new Set(teams.map(t => t.conference))
            for (const conf of conferences) {
              const aliveInConf = rows.filter(
                r => aliveAbbrs.has(r.team) && teamConf.get(r.team) === conf,
              )
              const totalConf = aliveInConf.reduce((s, r) => s + r.conf_title_pct, 0)
              if (totalConf > 0) {
                for (const row of aliveInConf) {
                  row.conf_title_pct = (row.conf_title_pct / totalConf) * 100
                }
              }
            }
          }
        }

        const { error } = await db
          .from('sim_results')
          .upsert(rows, { onConflict: 'team,league' })

        if (error) throw error

        // Snapshot for history / sparklines (Phase 4)
        const snapDate = new Date().toISOString().split('T')[0]
        const snapRows = rows.map(r => ({
          team: r.team,
          league: r.league,
          snap_date: snapDate,
          playoff_pct: r.playoff_pct,
          div_title_pct: r.div_title_pct,
          championship_pct: r.championship_pct,
          kalshi_champ_pct: r.kalshi_champ_pct,
          sportsbook_champ_pct: r.sportsbook_champ_pct,
          champ_ev_pct: r.champ_ev_pct,
        }))
        const { error: snapErr } = await db
          .from('sim_snapshots')
          .upsert(snapRows, { onConflict: 'team,league,snap_date' })
        if (snapErr) console.warn(`  [${league.slug.toUpperCase()}] Snapshot write failed: ${snapErr.message}`)

        // Upsert game importance (top 15 most pivotal upcoming games)
        if (gameImportance.length > 0) {
          const importanceRows = gameImportance.slice(0, 15).map(g => ({
            league: league.slug,
            game_date: g.date,
            home_team: g.homeTeamAbbr,
            away_team: g.awayTeamAbbr,
            home_playoff_swing: g.homePlayoffSwing,
            away_playoff_swing: g.awayPlayoffSwing,
            importance_score: g.importanceScore,
            updated_at: new Date().toISOString(),
          }))
          const { error: impErr } = await db
            .from('game_importance')
            .upsert(importanceRows, { onConflict: 'league,game_date,home_team,away_team' })
          if (impErr) console.warn(`  [${league.slug.toUpperCase()}] Game importance write failed: ${impErr.message}`)
          else console.log(`  [${league.slug.toUpperCase()}] ✓ ${importanceRows.length} game importance rows upserted`)
        }

        const edgeTeams = rows.filter(r => r.champ_ev_pct != null && r.champ_ev_pct > 5)
        console.log(
          `  [${league.slug.toUpperCase()}] ✓ ${rows.length} teams upserted` +
          (edgeTeams.length > 0
            ? ` | 🎯 ${edgeTeams.length} VALUE team(s): ${edgeTeams.map(r => `${r.team} +${r.champ_ev_pct!.toFixed(1)}%`).join(', ')}`
            : ''),
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

/**
 * Look up a team in a market-name map (lowercase keys → %).
 * Tries displayName, then name (nickname), then partial match.
 */
function findInMap(
  map: Map<string, number>,
  team: { abbreviation: string; name: string; displayName: string },
): number | null {
  if (map.size === 0) return null

  const dn = team.displayName.toLowerCase()
  const nn = team.name.toLowerCase()

  if (map.has(dn)) return map.get(dn)!
  if (map.has(nn)) return map.get(nn)!

  // Partial match scan
  for (const [key, val] of map) {
    if (key.includes(nn) || nn.includes(key)) return val
    if (key.includes(dn) || dn.includes(key)) return val
  }
  return null
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
