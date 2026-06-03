'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getLeague, type SimResult, type LeagueConfig } from '@/types'
import { getTeamResult, getLeagueResults, getLeagueImportantGames, type ImportantGame } from '@/lib/supabase'
import ImportantGames from '@/components/ImportantGames'
import ScheduleTable from '@/components/ScheduleTable'
import type { Game, LeagueTeam } from '@/types'

// SeedChart uses Recharts which requires browser APIs — load client-side only
const SeedChart = dynamic(() => import('@/components/SeedChart'), { ssr: false })

interface Props {
  league: string
  team: string
}

function StatCard({
  label,
  value,
  color,
  tooltip,
  sub,
}: {
  label: string
  value: string
  color: string
  tooltip?: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-5 group relative">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1">
        {label}
        {tooltip && (
          <span className="cursor-help text-gray-600 hover:text-gray-400 transition-colors">
            ⓘ
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 rounded-lg bg-gray-900 border border-surface-border px-3 py-2 text-xs text-gray-300 leading-snug opacity-0 group-hover:opacity-100 transition-opacity z-10 shadow-lg">
              {tooltip}
            </span>
          </span>
        )}
      </p>
      <p className={`text-3xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-600 mt-1">{sub}</p>}
    </div>
  )
}

function pctColor(pct: number): string {
  if (pct >= 60) return 'text-green-400'
  if (pct >= 40) return 'text-yellow-400'
  return 'text-red-400'
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
    b.wins !== a.wins ? b.wins - a.wins : a.losses - b.losses

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
  const record = `${team.wins}-${team.losses}`
  const gp = team.wins + team.losses

  // Position sentence
  let positionSentence = ''
  if (divRank === 1 && team.games_back === 0) {
    const lead = divTeams[1]
      ? `, ${(divTeams[1].games_back ?? 0).toFixed(1)} GB ahead of the pack`
      : ''
    positionSentence = `They lead the ${division ?? 'division'}${lead}.`
  } else if (divRank > 0) {
    const gb = team.games_back > 0 ? ` (${team.games_back.toFixed(1)} GB)` : ''
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
    ])
      .then(([res, all, imp]) => {
        setResult(res)
        setAllResults(all)
        setImportantGames(imp)
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

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/${league}`}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          ← {config.name}
        </Link>
        <h1 className="text-4xl font-black tracking-tight text-white mt-2">{teamAbbr}</h1>
        <p className="text-gray-500 text-sm">{config.name} · Sim-based probabilities</p>
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
              <div className="rounded-xl border border-surface-border bg-surface-card p-5 mb-6">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Position Summary</p>
                <p className="text-sm text-gray-300 leading-relaxed">{summary}</p>
              </div>
            ) : null
          })()}

          {/* Key stats */}
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
                    result.champ_ev_pct > 5
                      ? 'text-green-400'
                      : result.champ_ev_pct < -5
                      ? 'text-red-400'
                      : 'text-gray-300'
                  }
                  tooltip="Kalshi % minus Sportsbook %. Positive = sportsbooks undervaluing this team relative to the prediction market."
                  sub={result.champ_ev_pct > 5 ? '🎯 VALUE' : result.champ_ev_pct < -5 ? 'Overpriced' : 'Fairly priced'}
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

          {/* Seed distribution */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-6 mb-6">
            <h2 className="text-lg font-bold text-white mb-4">Seed Distribution</h2>
            <SeedChart seedDistribution={result.seed_distribution} />
          </div>

          {/* Most impactful upcoming games for this team */}
          {importantGames.length > 0 && (
            <div className="mb-6">
              <ImportantGames games={importantGames} focusTeam={teamAbbr} />
            </div>
          )}
        </>
      )}

      {/* Upcoming schedule — fetched from ESPN, loads separately */}
      <div className="rounded-xl border border-surface-border bg-surface-card p-6">
        <h2 className="text-lg font-bold text-white mb-4">Upcoming Schedule</h2>
        {scheduleLoading ? (
          <p className="text-gray-500 text-sm">Loading schedule…</p>
        ) : scheduleGames.length === 0 ? (
          <p className="text-gray-500 text-sm">No upcoming games found.</p>
        ) : (
          <ScheduleTable games={scheduleGames} />
        )}
      </div>
    </div>
  )
}
