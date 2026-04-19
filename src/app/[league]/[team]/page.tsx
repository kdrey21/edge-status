import { notFound } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getLeague } from '@/types'
import { getTeamResult } from '@/lib/supabase'
import ScheduleTable from '@/components/ScheduleTable'
import { fetchUpcomingGames, fetchStandings } from '@/lib/espn'

// SeedChart uses Recharts which requires browser APIs — load client-side
const SeedChart = dynamic(() => import('@/components/SeedChart'), { ssr: false })

export const revalidate = 3600

interface Props {
  params: { league: string; team: string }
}

export async function generateStaticParams() {
  return []
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-black ${color}`}>{value}</p>
    </div>
  )
}

function pctColor(pct: number): string {
  if (pct >= 60) return 'text-green-400'
  if (pct >= 40) return 'text-yellow-400'
  return 'text-red-400'
}

export default async function TeamPage({ params }: Props) {
  const config = getLeague(params.league)
  if (!config) notFound()

  const teamAbbr = params.team.toUpperCase()

  let result = null
  try {
    result = await getTeamResult(params.league, teamAbbr)
  } catch {
    // DB not configured
  }

  // Fetch upcoming games to build schedule table
  let scheduleGames: { date: string; opponent: string; isHome: boolean; winProb: number }[] = []
  try {
    const [espnGames, standings] = await Promise.all([
      fetchUpcomingGames(config.espnPath),
      fetchStandings(config.espnPath, config.totalGames),
    ])

    const thisTeam = standings.find(t => t.abbreviation.toUpperCase() === teamAbbr)
    const eloMap = new Map(standings.map(t => [t.id, { abbr: t.abbreviation, elo: t.elo }]))

    if (thisTeam) {
      const HOME_ELO_ADV = 65
      const ELO_SCALE = 400

      scheduleGames = espnGames
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
    }
  } catch {
    // ESPN fetch failed — schedule stays empty
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href={`/${params.league}`}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          ← {config.name}
        </Link>
        <h1 className="text-4xl font-black tracking-tight text-white mt-2">
          {teamAbbr}
        </h1>
        <p className="text-gray-500 text-sm">{config.name} · Sim-based probabilities</p>
      </div>

      {!result ? (
        <div className="rounded-xl border border-surface-border bg-surface-card p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No data for {teamAbbr}.</p>
          <p className="text-gray-600 text-sm">Run a simulation to populate this page.</p>
        </div>
      ) : (
        <>
          {/* Key stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            <StatCard
              label="Make Playoffs"
              value={result.playoff_pct.toFixed(1) + '%'}
              color={pctColor(result.playoff_pct)}
            />
            <StatCard
              label="Win Division"
              value={result.div_title_pct.toFixed(1) + '%'}
              color={pctColor(result.div_title_pct)}
            />
            <StatCard
              label="Win Conference"
              value={result.conf_title_pct.toFixed(1) + '%'}
              color={pctColor(result.conf_title_pct)}
            />
            <StatCard
              label="Win Championship"
              value={result.championship_pct.toFixed(1) + '%'}
              color={pctColor(result.championship_pct)}
            />
          </div>

          {/* Magic / elimination numbers */}
          {(result.magic_number !== null || result.elim_number !== null) && (
            <div className="grid grid-cols-2 gap-3 mb-8 max-w-sm">
              {result.magic_number !== null && (
                <StatCard
                  label="Magic Number"
                  value={String(result.magic_number)}
                  color="text-green-400"
                />
              )}
              {result.elim_number !== null && (
                <StatCard
                  label="Elim Number"
                  value={String(result.elim_number)}
                  color="text-red-400"
                />
              )}
            </div>
          )}

          {/* Seed distribution */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-6 mb-6">
            <h2 className="text-lg font-bold text-white mb-4">Seed Distribution</h2>
            <SeedChart seedDistribution={result.seed_distribution} />
          </div>

          {/* Schedule */}
          <div className="rounded-xl border border-surface-border bg-surface-card p-6">
            <h2 className="text-lg font-bold text-white mb-4">Upcoming Schedule</h2>
            <ScheduleTable games={scheduleGames} />
          </div>
        </>
      )}
    </div>
  )
}
