import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getLeague, type SimResult } from '@/types'
import { getLeagueResults } from '@/lib/supabase'
import StandingsTable from '@/components/StandingsTable'

export const revalidate = 3600

interface Props {
  params: { league: string }
}

export async function generateStaticParams() {
  return []
}

export default async function LeaguePage({ params }: Props) {
  const config = getLeague(params.league)
  if (!config) notFound()

  let results: SimResult[] = []
  try {
    results = await getLeagueResults(params.league)
  } catch {
    // DB not configured
  }

  // Group results by conference (we don't have conference in sim_results, so show all together)
  const updatedAt = results[0]?.updated_at
    ? new Date(results[0].updated_at).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : null

  return (
    <div>
      <div className="mb-8">
        <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          ← All Leagues
        </Link>
        <h1 className="text-4xl font-black tracking-tight text-white mt-2 mb-1">
          {config.name} Playoff Odds
        </h1>
        {updatedAt && (
          <p className="text-gray-500 text-sm">Last updated {updatedAt}</p>
        )}
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface-card p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No simulation data yet.</p>
          <p className="text-gray-600 text-sm">
            Trigger a sim run or wait for the daily cron at 06:00 UTC.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[
              { label: 'Green', desc: '>60% playoff' },
              { label: 'Yellow', desc: '40–60%' },
              { label: 'Red', desc: '<40%' },
            ].map(({ label, desc }) => (
              <div key={label} className="flex items-center gap-2 text-xs text-gray-500">
                <span
                  className={`w-2 h-2 rounded-full ${
                    label === 'Green'
                      ? 'bg-green-400'
                      : label === 'Yellow'
                      ? 'bg-yellow-400'
                      : 'bg-red-400'
                  }`}
                />
                {desc}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 mb-3">
            Click a column header to sort. Click a team to see full breakdown.
          </p>
          <StandingsTable results={results} league={params.league} />
        </>
      )}
    </div>
  )
}
