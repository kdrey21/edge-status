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
import { LEAGUES, type Game, type LeagueTeam } from '@/types'
import { fetchStandings, fetchUpcomingGames, fetchCompletedGames, isLeagueActive, fetchPlayoffState, fetchSeasonPhase } from '@/lib/espn'
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
 * Match a team's market-name key(s) to a value in a market map. Tries an EXACT
 * key match first, then falls back to substring-both-ways. Exact-first matters
 * for leagues with prefix-overlapping names (e.g. NCAAF "texas" would otherwise
 * substring-match "texas a&m" / "texas tech" depending on map order).
 */
function matchMarketPct(keys: string[], map: Map<string, number>): number | null {
  for (const key of keys) {
    if (map.has(key)) return map.get(key)!
  }
  for (const key of keys) {
    for (const [mk, mv] of map) {
      if (mk.includes(key) || key.includes(mk)) return mv
    }
  }
  return null
}

/**
 * Remove orphan rows for a league — stale team abbreviations left behind when
 * ESPN changes a team's abbreviation (e.g. the Coyotes→Utah relocation, or a
 * "UTAH" variant lingering after ESPN standardized on "UTA"). Without this the
 * old abbr stays in sim_results forever and shows up as a duplicate team row.
 *
 * A row is valid if its team was written this run OR is a canonical/alias abbr
 * declared in the league's `teams[]`. Everything else is deleted. This protects
 * both ESPN-form rows not in teams[] (e.g. MLB writes CHW/ATH) and teams that
 * are temporarily absent from an off-season market feed (still in teams[]).
 */
async function deleteOrphanRows(slug: string, validTeams: string[]): Promise<void> {
  const valid = Array.from(new Set(validTeams.filter(Boolean)))
  if (valid.length === 0) return
  const { data, error } = await db
    .from('sim_results')
    .delete()
    .eq('league', slug)
    .not('team', 'in', `(${valid.join(',')})`)
    .select('team')
  if (error) {
    console.warn(`  [${slug.toUpperCase()}] Orphan cleanup failed: ${error.message}`)
    return
  }
  if (data && data.length > 0) {
    console.log(
      `  [${slug.toUpperCase()}] 🧹 Removed ${data.length} orphan row(s): ${data.map((r: { team: string }) => r.team).join(', ')}`,
    )
  }
}

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
        // Futures-only leagues (e.g. NCAAF) never sim, so skip the heavy ESPN
        // standings/schedule fetch entirely — the market-only path only needs
        // league.teams + market odds.
        let teams: LeagueTeam[] = []
        let espnGames: Game[] = []
        let completedGames: Game[] = []
        let seasonPhase: { name: string; inSeason: boolean } | null =
          { name: 'Futures-only', inSeason: false }

        if (!league.futuresOnly) {
          console.log(`  [${league.slug.toUpperCase()}] Fetching standings…`)
          ;[teams, espnGames, completedGames, seasonPhase] = await Promise.all([
            fetchStandings(league.espnPath, league.totalGames, league.coreLeague, league.coreSeasonType),
            fetchUpcomingGames(league.espnPath),
            fetchCompletedGames(league.espnPath),
            fetchSeasonPhase(league.espnPath, league.coreLeague),
          ])
        }

        console.log(
          `  [${league.slug.toUpperCase()}] ESPN phase: ${seasonPhase?.name ?? 'unknown'}` +
          ` → ${seasonPhase?.inSeason ? 'in-season' : 'off-season'}`,
        )

        const h2hMatrix = buildH2HMatrix(completedGames)
        console.log(
          `  [${league.slug.toUpperCase()}] H2H matrix: ${completedGames.length} completed games → ${h2hMatrix.size} teams with wins`,
        )

        // Log a sample of games_back values to verify the fix is working
        const gbSample = teams.slice(0, 5).map(t => `${t.abbreviation}:${t.gamesBack.toFixed(1)}`).join(' ')
        console.log(`  [${league.slug.toUpperCase()}] GB sample: ${gbSample}`)

        if (league.futuresOnly || !isLeagueActive(teams, seasonPhase)) {
          // A league that was in-season last run still has stale sim columns
          // (playoff_pct etc.) in its rows. The home page keys "In Season" off
          // playoff_pct != null, and the market-only upsert below only touches
          // teams that match a futures market — so unmatched teams (or a failed
          // market fetch) would leave the league stuck showing "In Season".
          // Null the sim columns league-wide first to guarantee the flip.
          const { error: clearErr } = await db
            .from('sim_results')
            .update({
              playoff_pct: null, div_title_pct: null, conf_title_pct: null,
              championship_pct: null, seed_distribution: null,
              magic_number: null, elim_number: null,
              updated_at: new Date().toISOString(),
            })
            .eq('league', league.slug)
          if (clearErr) console.warn(`  [${league.slug.toUpperCase()}] Sim-column clear failed: ${clearErr.message}`)

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

          // TEMP DEBUG: dump Odds API team names containing "miami" (to fix the
          // Miami (FL) sportsbook match). Remove after inspection.
          if (league.slug === 'ncaaf') {
            const miamiOdds = [...oddsMap.keys()].filter(k => k.includes('miami'))
            console.log(`  [NCAAF][DEBUG] Odds 'miami*' names: ${JSON.stringify(miamiOdds)}`)
          }

          const nameMap = league.marketNameMap!
          const rows: object[] = []

          for (const abbr of league.teams) {
            // Find the market name key(s) that map to this abbreviation
            const marketKeys = Object.entries(nameMap)
              .filter(([, v]) => v === abbr)
              .map(([k]) => k)

            const kalshi_champ_pct = matchMarketPct(marketKeys, kalshiMap)
            const sportsbook_champ_pct = matchMarketPct(marketKeys, oddsMap)

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
          // Drop stale alias rows (e.g. NBA "UTAH" vs "UTA") so a team never
          // appears twice. Valid = teams written this run + canonical teams[].
          await deleteOrphanRows(league.slug, [
            ...(rows as { team: string }[]).map(r => r.team),
            ...league.teams,
          ])

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
            updated_at: new Date().toISOString(),
          }
        })

        // -------------------------------------------------------------------
        // Playoff state adjustment (sport-agnostic)
        // Once the real playoff bracket exists (ESPN season type 3), outcomes
        // that have already happened are FACTS, not probabilities:
        //   • playoff_pct  → 100 for teams that made the bracket, 0 for the rest
        //   • championship → 0 for any team eliminated from the playoffs
        //   • conf_title   → 0 for any team eliminated within its conference bracket
        // Alive teams are renormalized so each field still sums to 100%. Play-in
        // games are ESPN season type 5 and are excluded, so play-in losers are
        // never counted as having made the playoffs.
        // -------------------------------------------------------------------
        const playoff = await fetchPlayoffState(league.espnPath)
        if (playoff.participants.size > 0) {
          const idToAbbr = new Map(teams.map(t => [t.id, t.abbreviation]))
          const abbrToConf = new Map(teams.map(t => [t.abbreviation, t.conference]))
          const toAbbr = (id: string) => idToAbbr.get(id)

          const participantAbbrs = new Set(
            [...playoff.participants].map(toAbbr).filter((a): a is string => a != null),
          )

          // champEliminated: lost any completed series/game → out of the title race
          // confEliminated:  lost to a SAME-conference opponent → didn't win its conf
          //   (the final is cross-conference, so a finals loser still won its conf)
          const champEliminated = new Set<string>()
          const confEliminated = new Set<string>()
          for (const [loserId, winnerId] of playoff.eliminations) {
            const loser = toAbbr(loserId)
            if (!loser) continue
            champEliminated.add(loser)
            const winner = toAbbr(winnerId)
            if (winner && abbrToConf.get(loser) === abbrToConf.get(winner)) {
              confEliminated.add(loser)
            }
          }

          const aliveSet = new Set(
            [...participantAbbrs].filter(a => !champEliminated.has(a)),
          )
          console.log(
            `  [${league.slug.toUpperCase()}] Playoff mode — ${participantAbbrs.size} in bracket, ${aliveSet.size} alive: ${[...aliveSet].sort().join(', ')}`,
          )

          for (const row of rows) {
            const made = participantAbbrs.has(row.team)
            // 1. Playoff berth is settled
            row.playoff_pct = made ? 100 : 0
            row.magic_number = null
            row.elim_number = made ? null : 0
            // 2. Championship — zero out anyone eliminated from the playoffs
            if (!made || champEliminated.has(row.team)) row.championship_pct = 0
            // 3. Conference title — zero out anyone eliminated within its conference
            if (!made || confEliminated.has(row.team)) row.conf_title_pct = 0
          }

          // Renormalize championship_pct among alive teams → sum to 100
          if (aliveSet.size > 0) {
            const totalChamp = rows
              .filter(r => aliveSet.has(r.team))
              .reduce((s, r) => s + r.championship_pct, 0)
            for (const row of rows) {
              if (!aliveSet.has(row.team)) continue
              row.championship_pct = totalChamp > 0
                ? (row.championship_pct / totalChamp) * 100
                : 100 / aliveSet.size // sim gave ~0 to all alive underdogs → split evenly
            }
          }

          // Renormalize conf_title_pct per conference among conf-alive participants → 100
          for (const conf of new Set(teams.map(t => t.conference))) {
            const confAlive = rows.filter(
              r => participantAbbrs.has(r.team) &&
                   !confEliminated.has(r.team) &&
                   abbrToConf.get(r.team) === conf,
            )
            if (confAlive.length === 0) continue
            const totalConf = confAlive.reduce((s, r) => s + r.conf_title_pct, 0)
            for (const row of confAlive) {
              row.conf_title_pct = totalConf > 0
                ? (row.conf_title_pct / totalConf) * 100
                : 100 / confAlive.length
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

        // Drop stale alias rows (e.g. relocated-team abbr changes) so a team
        // never appears twice. Valid = teams written this run + canonical teams[].
        await deleteOrphanRows(league.slug, [
          ...rows.map(r => r.team),
          ...league.teams,
        ])

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
