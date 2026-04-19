import { LEAGUES } from '@/types'
import { getAllLeaguesSummary } from '@/lib/supabase'
import LeagueCard from '@/components/LeagueCard'

export const revalidate = 3600

export default async function HomePage() {
  let summary: { league: string; count: number; updated_at: string }[] = []
  try {
    summary = await getAllLeaguesSummary()
  } catch {
    // Supabase not configured yet — show all leagues as inactive
  }

  const summaryMap = new Map(summary.map(s => [s.league, s]))

  return (
    <div>
      <div className="mb-10">
        <h1 className="text-4xl font-black tracking-tight text-white mb-2">
          Playoff Probabilities
        </h1>
        <p className="text-gray-400 text-lg">
          Monte Carlo simulation across 50,000 season scenarios.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LEAGUES.map(league => {
          const data = summaryMap.get(league.slug)
          const active = (data?.count ?? 0) > 0
          return (
            <LeagueCard
              key={league.slug}
              league={league}
              active={active}
              updatedAt={data?.updated_at}
            />
          )
        })}
      </div>
    </div>
  )
}
