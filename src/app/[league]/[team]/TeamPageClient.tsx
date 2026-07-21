'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getLeague, type SimResult, type LeagueConfig } from '@/types'
import { espnLogoUrl } from '@/lib/logos'
import { getTeamResult, getLeagueResults, getLeagueImportantGames, getTeamSnapshots, type ImportantGame, type SnapPoint } from '@/lib/supabase'
import ScheduleTable from '@/components/ScheduleTable'
import type { Game, LeagueTeam } from '@/types'

// Recharts components load client-side only
const SeedChart = dynamic(() => import('@/components/SeedChart'), { ssr: false })
const TrendChart = dynamic(() => import('@/components/TrendChart'), { ssr: false })

interface Props {
  league: string
  team: string
}

function StatCard({
  label,
  value,
  color,
  sub,
}: {
  label: string
  value: string
  color: string
  sub?: string
  /** tooltip kept for compat but not rendered — see Phase 5 mobile UX backlog */
  tooltip?: string
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card shadow-card p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-[#484f6a] mb-2">{label}</p>
      <p className={`font-display text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-[11px] text-[#484f6a] mt-1.5">{sub}</p>}
    </div>
  )
}

function pctColor(pct: number): string {
  if (pct >= 60) return 'text-playoff-high'
  if (pct >= 40) return 'text-playoff-mid'
  return 'text-playoff-low'
}

/** Ordinal suffix: 1→"1st", 2→"2nd", etc. */
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/**
 * Generate a 2–3 sentence plain-English summary of a team's current
 * playoff position and odds. Uses only data already available in Supabase.
 */
function generatePositionSummary(
  teamAbbr: string,
  team: SimResult,
  allTeams: SimResult[],
  config: LeagueConfig,
): string {
  if (!config) return ''

  const division  = config.divisionMap?.[teamAbbr]
  const conference = config.conferenceMap?.[teamAbbr]

  // Sort helper: best record first (wins desc, losses asc)
  const byRecord = (a: SimResult, b: SimResult) =>
    (b.wins ?? 0) !== (a.wins ?? 0) ? (b.wins ?? 0) - (a.wins ?? 0) : (a.losses ?? 0) - (b.losses ?? 0)

  // Division standings
  const divTeams = division
    ? allTeams.filter(t => config.divisionMap?.[t.team] === division).sort(byRecord)
    : []
  const divRank = divTeams.findIndex(t => t.team === teamAbbr) + 1
  const divLeader = divTeams[0]

  // Conference standings (for wild card position)
  const confTeams = conference
    ? allTeams.filter(t => config.conferenceMap?.[t.team] === conference).sort(byRecord)
    : []

  // Number of division winners per conference = number of unique divisions
  const divsInConf = conference
    ? new Set(confTeams.map(t => config.divisionMap?.[t.team]).filter(Boolean)).size
    : 0
  const wcSpots = Math.max(0, config.playoffTeamsPerConference - divsInConf)

  // Wild card position: among non-division-leaders
  const divLeaders = new Set(
    [...(new Set(confTeams.map(t => config.divisionMap?.[t.team]).filter(Boolean)))]
      .map(div => confTeams.filter(t => config.divisionMap?.[t.team] === div)[0]?.team)
      .filter(Boolean),
  )
  const wcTeams = confTeams.filter(
    t => t.team === teamAbbr || !divLeaders.has(t.team),
  )
  const wcRank = wcTeams.findIndex(t => t.team === teamAbbr) + 1

  // Record sentence
  const record = `${team.wins ?? 0}-${team.losses ?? 0}`
  const gp = (team.wins ?? 0) + (team.losses ?? 0)

  // Position sentence
  let positionSentence = ''
  if (divRank === 1 && (team.games_back ?? 0) === 0) {
    const lead = divTeams[1]
      ? `, ${(divTeams[1].games_back ?? 0).toFixed(1)} GB ahead of the pack`
      : ''
    positionSentence = `They lead the ${division ?? 'division'}${lead}.`
  } else if (divRank > 0) {
    const gb = (team.games_back ?? 0) > 0 ? ` (${(team.games_back ?? 0).toFixed(1)} GB)` : ''
    positionSentence = `They sit ${ordinal(divRank)} in the ${division ?? 'division'}${gb}.`
  }

  // Wild card context (only for non-division leaders)
  let wcSentence = ''
  if (wcSpots > 0 && divRank !== 1 && wcRank > 0) {
    if (wcRank <= wcSpots) {
      wcSentence = ` They currently hold the ${ordinal(wcRank)} wild card spot.`
    } else {
      const spotsOut = wcRank - wcSpots
      wcSentence = ` They're ${spotsOut} spot${spotsOut > 1 ? 's' : ''} outside the wild card.`
    }
  }

  // Playoff odds sentence
  const pct = team.playoff_pct ?? 0
  let oddsDesc: string
  if (pct >= 97)       oddsDesc = `With a ${pct.toFixed(0)}% playoff probability, they're virtually clinched.`
  else if (pct >= 80)  oddsDesc = `Their ${pct.toFixed(1)}% playoff odds put them in strong position.`
  else if (pct >= 55)  oddsDesc = `At ${pct.toFixed(1)}%, they're on the right side of the bubble — but not safe yet.`
  else if (pct >= 35)  oddsDesc = `Their ${pct.toFixed(1)}% odds make this a genuine playoff race.`
  else if (pct >= 15)  oddsDesc = `At ${pct.toFixed(1)}%, they're fighting long odds to reach the postseason.`
  else if (pct > 0)    oddsDesc = `With just ${pct.toFixed(1)}% playoff odds, they need a near-miracle run.`
  else                 oddsDesc = `They've been mathematically eliminated from playoff contention.`

  // Magic / elim number coda
  let numberCoda = ''
  if (team.magic_number != null && team.magic_number <= 10) {
    numberCoda = ` Magic number: ${team.magic_number}.`
  } else if (team.elim_number != null && team.elim_number <= 8) {
    numberCoda = ` Elimination number: ${team.elim_number}.`
  }

  // Games played context (early season caveat)
  const caveat = gp < 20 ? ' (Early season — small sample size.)' : ''

  return [
    `${teamAbbr} is ${record} through ${gp} games.`,
    positionSentence + wcSentence,
    oddsDesc + numberCoda + caveat,
  ].filter(Boolean).join(' ')
}

type ScheduleGame = { date: string; opponent: string; isHome: boolean; winProb: number }

export default function TeamPageClient({ league, team }: Props) {
  const config = getLeague(league)
  const teamAbbr = team.toUpperCase()

  const [result, setResult] = useState<SimResult | null>(null)
  const [allResults, setAllResults] = useState<SimResult[]>([])
  const [snapshots, setSnapshots] = useState<SnapPoint[]>([])
  const [simLoading, setSimLoading] = useState(true)
  const [importantGames, setImportantGames] = useState<ImportantGame[]>([])

  const [scheduleGames, setScheduleGames] = useState<ScheduleGame[]>([])
  const [scheduleLoading, setScheduleLoading] = useState(true)

  // Fetch sim data (this team + all league results for context) + important games
  useEffect(() => {
    if (!config) {
      setSimLoading(false)
      return
    }
    Promise.all([
      getTeamResult(league, teamAbbr),
      getLeagueResults(league),
      getLeagueImportantGames(league, teamAbbr, 10),
      getTeamSnapshots(league, teamAbbr, 30),
    ])
      .then(([res, all, imp, snaps]) => {
        setResult(res)
        setAllResults(all)
        setImportantGames(imp)
        setSnapshots(snaps)
      })
      .catch(() => {})
      .finally(() => setSimLoading(false))
  }, [league, teamAbbr]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch upcoming schedule from ESPN (best-effort; graceful CORS fallback)
  useEffect(() => {
    if (!config) {
      setScheduleLoading(false)
      return
    }

    async function loadSchedule() {
      const { fetchUpcomingGames, fetchStandings } = await import('@/lib/espn')
      const [espnGames, standings] = await Promise.all([
        fetchUpcomingGames(config!.espnPath),
        fetchStandings(config!.espnPath, config!.totalGames, config!.coreLeague, config!.coreSeasonType),
      ])

      const thisTeam = standings.find(
        (t: LeagueTeam) => t.abbreviation.toUpperCase() === teamAbbr,
      )
      const eloMap = new Map(
        standings.map((t: LeagueTeam) => [t.id, { abbr: t.abbreviation, elo: t.elo }]),
      )

      if (!thisTeam) return

      const HOME_ELO_ADV = 65
      const ELO_SCALE = 400

      const games: ScheduleGame[] = (espnGames as Game[])
        .filter(g => !g.completed)
        .filter(g => g.homeTeamId === thisTeam.id || g.awayTeamId === thisTeam.id)
        .slice(0, 20)
        .map(g => {
          const isHome = g.homeTeamId === thisTeam.id
          const oppId = isHome ? g.awayTeamId : g.homeTeamId
          const opp = eloMap.get(oppId)
          const adjElo = isHome ? thisTeam.elo + HOME_ELO_ADV : thisTeam.elo
          const oppElo = opp?.elo ?? 1500
          const winProb = 1 / (1 + Math.pow(10, -(adjElo - oppElo) / ELO_SCALE))
          return {
            date: g.date,
            opponent: opp?.abbr ?? 'OPP',
            isHome,
            winProb,
          }
        })

      setScheduleGames(games)
    }

    loadSchedule()
      .catch(() => {})
      .finally(() => setScheduleLoading(false))
  }, [league, teamAbbr]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card p-12 text-center">
        <p className="text-gray-400">League not found.</p>
      </div>
    )
  }

  // Futures / off-season mode: the row is market-only (all sim columns null),
  // so the sim-oriented sections (key-stat grid, division table, schedule)
  // would render nothing but "—". Show only the market-vs-book cards + trend.
  const isFutures = result != null && result.playoff_pct == null

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/${league}`}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          ← {config.name}
        </Link>
        <div className="flex items-center gap-3 mt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={espnLogoUrl(league, teamAbbr)}
            alt=""
            width={48}
            height={48}
            className="w-12 h-12 shrink-0 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <h1 className="font-display text-4xl font-bold tracking-tight text-[#eef0f8]">{teamAbbr}</h1>
        </div>
        <p className="text-[#484f6a] text-sm mt-1">{config.name} · {isFutures ? 'Championship futures' : 'Sim-based probabilities'}</p>
      </div>

      {simLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8 animate-pulse">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-surface-border bg-surface-card p-5 h-24"
            />
          ))}
        </div>
      ) : !result ? (
        <div className="rounded-xl border border-surface-border bg-surface-card p-12 text-center mb-8">
          <p className="text-gray-400 text-lg mb-2">No data for {teamAbbr}.</p>
          <p className="text-gray-600 text-sm">Run a simulation to populate this page.</p>
        </div>
      ) : (
        <>
          {/* Position summary */}
          {allResults.length > 0 && result.playoff_pct != null && (() => {
            const summary = generatePositionSummary(teamAbbr, result, allResults, config)
            return summary ? (
              <div className="rounded-xl border border-surface-border bg-surface-card shadow-card p-5 mb-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#484f6a] mb-2">Position Summary</p>
                <p className="text-sm text-[#8892aa] leading-relaxed">{summary}</p>
              </div>
            ) : null
          })()}

          {/* Division standings — hidden in futures mode (all sim columns null) */}
          {!isFutures && allResults.length > 0 && config.divisionMap && (() => {
            const division = config.divisionMap[teamAbbr]
            if (!division) return null

            // Compute GB in the browser from wins/losses — avoids depending on
            // the sim writing a correct games_back value to Supabase.
            // GB = ((leaderWins - teamWins) + (teamLosses - leaderLosses)) / 2
            const raw = allResults.filter(r => config.divisionMap![r.team] === division)
            if (raw.length === 0) return null
            const leader = raw.reduce((best, r) =>
              (r.wins ?? 0) / Math.max(1, (r.wins ?? 0) + (r.losses ?? 0)) >
              (best.wins ?? 0) / Math.max(1, (best.wins ?? 0) + (best.losses ?? 0))
                ? r : best
            )
            const divTeams = raw
              .map(r => ({
                ...r,
                computedGB: ((leader.wins ?? 0) - (r.wins ?? 0) + (r.losses ?? 0) - (leader.losses ?? 0)) / 2,
              }))
              .sort((a, b) => a.computedGB - b.computedGB)

            return (
              <div className="rounded-xl border border-surface-border bg-surface-card shadow-card p-5 mb-6">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#484f6a] mb-3">
                  {division}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-surface-border">
                        <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">Team</th>
                        <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">W</th>
                        <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">L</th>
                        <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">GB</th>
                        <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">Playoff%</th>
                        <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">Champ%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-border">
                      {divTeams.map(r => {
                        const isMe = r.team === teamAbbr
                        return (
                          <tr
                            key={r.team}
                            className={`transition-colors ${isMe ? 'bg-brand/10' : 'hover:bg-surface-raised'}`}
                          >
                            <td className="py-2">
                              <Link
                                href={`/${league}/${r.team.toLowerCase()}`}
                                className="flex items-center gap-2 group"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={espnLogoUrl(league, r.team)}
                                  alt=""
                                  width={18}
                                  height={18}
                                  className="w-4.5 h-4.5 object-contain shrink-0"
                                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                />
                                <span className={`font-bold text-sm ${isMe ? 'text-brand' : 'text-[#eef0f8] group-hover:text-brand'} transition-colors`}>
                                  {r.team}
                                </span>
                              </Link>
                            </td>
                            <td className="py-2 text-right text-[#8892aa] font-mono text-xs">{r.wins ?? '—'}</td>
                            <td className="py-2 text-right text-[#8892aa] font-mono text-xs">{r.losses ?? '—'}</td>
                            <td className="py-2 text-right text-[#484f6a] font-mono text-xs">
                              {r.computedGB === 0 ? '—' : r.computedGB.toFixed(1)}
                            </td>
                            <td className={`py-2 text-right font-bold font-mono text-xs ${r.playoff_pct != null ? pctColor(r.playoff_pct) : 'text-[#484f6a]'}`}>
                              {r.playoff_pct != null ? r.playoff_pct.toFixed(1) + '%' : '—'}
                            </td>
                            <td className={`py-2 text-right font-mono text-xs ${r.championship_pct != null ? pctColor(r.championship_pct) : 'text-[#484f6a]'}`}>
                              {r.championship_pct != null ? r.championship_pct.toFixed(1) + '%' : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })()}

          {/* Key stats — sim probabilities; hidden in futures mode (all null) */}
          {!isFutures && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
              <StatCard
                label="Make Playoffs"
                value={result.playoff_pct != null ? result.playoff_pct.toFixed(1) + '%' : '—'}
                color={result.playoff_pct != null ? pctColor(result.playoff_pct) : 'text-gray-500'}
                tooltip="Probability of making the postseason in 50,000 simulated seasons."
              />
              <StatCard
                label="Win Division"
                value={result.div_title_pct != null ? result.div_title_pct.toFixed(1) + '%' : '—'}
                color={result.div_title_pct != null ? pctColor(result.div_title_pct) : 'text-gray-500'}
                tooltip="Probability of finishing first in the division."
              />
              <StatCard
                label="Win Conference"
                value={result.conf_title_pct != null ? result.conf_title_pct.toFixed(1) + '%' : '—'}
                color={result.conf_title_pct != null ? pctColor(result.conf_title_pct) : 'text-gray-500'}
                tooltip="Probability of winning the conference championship."
              />
              <StatCard
                label="Win Championship"
                value={result.championship_pct != null ? result.championship_pct.toFixed(1) + '%' : '—'}
                color={result.championship_pct != null ? pctColor(result.championship_pct) : 'text-gray-500'}
                tooltip="Probability of winning it all — based on simulated bracket outcomes."
              />
            </div>
          )}

          {/* Market championship odds — Kalshi + Sportsbook */}
          {(result.kalshi_champ_pct != null || result.sportsbook_champ_pct != null) && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
              {result.kalshi_champ_pct != null && (
                <StatCard
                  label="Kalshi Championship %"
                  value={result.kalshi_champ_pct.toFixed(1) + '%'}
                  color="text-white"
                  tooltip="Prediction market implied probability, field-normalized to sum to 100%."
                  sub="Prediction market"
                />
              )}
              {result.sportsbook_champ_pct != null && (
                <StatCard
                  label="Sportsbook Championship %"
                  value={result.sportsbook_champ_pct.toFixed(1) + '%'}
                  color="text-white"
                  tooltip="Consensus sportsbook implied probability, de-vigged to remove the house edge."
                  sub="De-vigged consensus"
                />
              )}
              {result.champ_ev_pct != null && (
                <StatCard
                  label="Market Edge (EV%)"
                  value={(result.champ_ev_pct > 0 ? '+' : '') + result.champ_ev_pct.toFixed(1) + '%'}
                  color={
                    result.champ_ev_pct > 3
                      ? 'text-edge-pos'
                      : result.champ_ev_pct < -3
                      ? 'text-edge-neg'
                      : 'text-[#8892aa]'
                  }
                  sub={result.champ_ev_pct > 3 ? '🎯 VALUE' : result.champ_ev_pct < -3 ? 'Overpriced' : 'Fairly priced'}
                />
              )}
            </div>
          )}

          {/* Magic / elimination numbers */}
          {(result.magic_number !== null || result.elim_number !== null) && (
            <div className="grid grid-cols-2 gap-3 mb-8 max-w-sm">
              {result.magic_number !== null && (
                <StatCard
                  label="Magic Number"
                  value={String(result.magic_number)}
                  color="text-green-400"
                  tooltip="Wins needed (by you) + losses needed (by nearest rival) to clinch a playoff spot. Hits 0 when you're in."
                />
              )}
              {result.elim_number !== null && (
                <StatCard
                  label="Elim Number"
                  value={String(result.elim_number)}
                  color="text-red-400"
                  tooltip="Losses you can absorb before being mathematically eliminated. When this hits 0, you're out regardless of remaining games."
                />
              )}
            </div>
          )}

          {/* Seed distribution — only rendered when sim data exists (null for off-season futures) */}
          {result.seed_distribution && Object.keys(result.seed_distribution).length > 0 && (
            <div className="rounded-xl border border-surface-border bg-surface-card p-6 mb-6">
              <h2 className="text-lg font-bold text-white mb-4">Seed Distribution</h2>
              <SeedChart seedDistribution={result.seed_distribution} />
            </div>
          )}

          {/* Trend chart — odds over time */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-6 mb-6">
            <h2 className="text-lg font-bold text-white mb-1">
              {isFutures ? 'Championship Futures Trend' : 'Odds Trend'}
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              {isFutures ? 'Kalshi vs. sportsbook · 30-day history' : '30-day history · updated daily'}
            </p>
            <TrendChart
              snapshots={snapshots}
              showPlayoff={result.playoff_pct != null}
              showChamp={result.championship_pct != null}
            />
          </div>

        </>
      )}

      {/* Upcoming schedule — hidden in futures mode (no games in off-season) */}
      {!isFutures && (
      <div className="rounded-xl border border-surface-border bg-surface-card p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#484f6a] mb-3">
          Upcoming Schedule
        </p>
        {scheduleLoading ? (
          <p className="text-[#484f6a] text-sm">Loading schedule…</p>
        ) : (() => {
          // Cross-reference ESPN schedule with game_importance playoff swings
          const gamesWithSwing = scheduleGames.slice(0, 5).map(g => {
            const opp = g.opponent.toUpperCase()
            const imp = importantGames.find(ig =>
              (ig.home_team === teamAbbr && ig.away_team === opp) ||
              (ig.away_team === teamAbbr && ig.home_team === opp)
            )
            const swing = imp
              ? (imp.home_team === teamAbbr ? imp.home_playoff_swing : imp.away_playoff_swing)
              : null
            return { ...g, playoffSwing: swing }
          })

          // Fallback: if ESPN fetch failed (CORS), show tracked games from Supabase sorted by date
          if (gamesWithSwing.length === 0) {
            const fallback = [...importantGames]
              .sort((a, b) => a.game_date.localeCompare(b.game_date))
              .slice(0, 5)
              .map(ig => {
                const isHome = ig.home_team === teamAbbr
                const opp = isHome ? ig.away_team : ig.home_team
                const swing = isHome ? ig.home_playoff_swing : ig.away_playoff_swing
                return {
                  date: ig.game_date,
                  opponent: opp,
                  isHome,
                  winProb: 0.5, // unknown without live Elo
                  playoffSwing: swing,
                }
              })

            if (fallback.length === 0) {
              return <p className="text-[#484f6a] text-sm py-4 text-center">No upcoming games found.</p>
            }

            return (
              <>
                <ScheduleTable games={fallback} limit={5} />
                <p className="text-[10px] text-[#484f6a] mt-3">
                  Win probability unavailable (ESPN schedule not loaded). Showing tracked games only.
                </p>
              </>
            )
          }

          return (
            <>
              <ScheduleTable games={gamesWithSwing} limit={5} />
              <p className="text-[10px] text-[#484f6a] mt-3">
                Playoff Swing = change in playoff % if this team wins vs loses · from 50k sims
              </p>
            </>
          )
        })()}
      </div>
      )}
    </div>
  )
}
