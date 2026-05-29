'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getLeague, type SimResult } from '@/types'
import { getLeagueResults } from '@/lib/supabase'
import StandingsTable from '@/components/StandingsTable'

interface Props {
  league: string
}

function LoadingRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-surface-card rounded w-full" />
        </td>
      ))}
    </tr>
  )
}

export default function LeaguePageClient({ league }: Props) {
  const config = getLeague(league)
  const [results, setResults] = useState<SimResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!config) {
      setLoading(false)
      return
    }
    getLeagueResults(league)
      .then(setResults)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [league]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!config) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card p-12 text-center">
        <p className="text-gray-400 text-lg">League not found.</p>
      </div>
    )
  }

  const updatedAt =
    results[0]?.updated_at
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
        {updatedAt && <p className="text-gray-500 text-sm">Last updated {updatedAt}</p>}
      </div>

      {loading ? (
        <div className="overflow-x-auto rounded-xl border border-surface-border">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-surface-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <LoadingRow key={i} />
              ))}
            </tbody>
          </table>
        </div>
      ) : results.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface-card p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No simulation data yet.</p>
          <p className="text-gray-600 text-sm">
            The daily sim runs at 06:00 UTC via GitHub Actions.
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
          <StandingsTable results={results} league={league} />
        </>
      )}
    </div>
  )
}
