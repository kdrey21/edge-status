'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getLeague, type SimResult } from '@/types'
import { getLeagueResults, getLeagueSnapshots, getLeagueImportantGames, type SnapPoint, type ImportantGame } from '@/lib/supabase'
import StandingsTable from '@/components/StandingsTable'
import ImportantGames from '@/components/ImportantGames'

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

/** Group snapshots by team, returning a Map sorted oldest→newest per team */
function buildSnapshotMap(snaps: SnapPoint[]): Map<string, SnapPoint[]> {
  const map = new Map<string, SnapPoint[]>()
  for (const s of snaps) {
    if (!map.has(s.team)) map.set(s.team, [])
    map.get(s.team)!.push(s)
  }
  // Already ordered oldest→newest from Supabase query
  return map
}

export default function LeaguePageClient({ league }: Props) {
  const config = getLeague(league)
  const [results, setResults] = useState<SimResult[]>([])
  const [snapshots, setSnapshots] = useState<Map<string, SnapPoint[]>>(new Map())
  const [importantGames, setImportantGames] = useState<ImportantGame[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!config) {
      setLoading(false)
      return
    }
    Promise.all([
      getLeagueResults(league),
      getLeagueSnapshots(league, 14),
      getLeagueImportantGames(league, undefined, 8),
    ])
      .then(([res, snaps, imp]) => {
        setResults(res)
        setSnapshots(buildSnapshotMap(snaps))
        setImportantGames(imp)
      })
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

  const hasSimData = results.some(r => r.playoff_pct != null)

  return (
    <div>
      <div className="mb-8">
        <Link href="/" className="text-gray-500 hover:text-gray-300 text-sm transition-colors">
          ← All Leagues
        </Link>
        <h1 className="text-4xl font-black tracking-tight text-white mt-2 mb-1">
          {config.name} {hasSimData ? 'Playoff Odds' : 'Championship Futures'}
        </h1>
        {updatedAt && <p className="text-gray-500 text-sm">Last updated {updatedAt}</p>}
        <p className="text-xs text-gray-600 mt-1">
          {hasSimData
            ? 'Playoff % from 50,000 Monte Carlo sims · Kalshi = prediction market reference · EV% = where markets disagree'
            : 'Kalshi = regulated prediction market · Book = de-vigged sportsbook consensus · EV% = Kalshi − Book'}
        </p>
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
          {/* Market edges callout — top EV% teams in this league */}
          {(() => {
            const topEdges = [...results]
              .filter(r => r.champ_ev_pct != null && r.champ_ev_pct > 3)
              .sort((a, b) => (b.champ_ev_pct ?? 0) - (a.champ_ev_pct ?? 0))
              .slice(0, 3)
            if (topEdges.length === 0) return null
            return (
              <div className="mb-5 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-green-400 mb-2">
                  Market edges today
                </p>
                <div className="flex flex-wrap gap-3">
                  {topEdges.map(r => (
                    <Link
                      key={r.team}
                      href={`/${league}/${r.team.toLowerCase()}`}
                      className="flex items-center gap-2 rounded-lg bg-surface-card border border-surface-border px-3 py-2 hover:border-green-500/40 transition-colors"
                    >
                      <span className="font-bold text-white text-sm">{r.team}</span>
                      <span className="text-green-400 font-bold text-sm">
                        +{r.champ_ev_pct!.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-gray-500">
                        K:{r.kalshi_champ_pct?.toFixed(1)}% B:{r.sportsbook_champ_pct?.toFixed(1)}%
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })()}

          <p className="text-xs text-gray-600 mb-3">
            {hasSimData
              ? 'Playoff % color: green >60% · yellow 40–60% · red <40% · Click a column to sort · Click a team for full breakdown'
              : 'Sorted by Sportsbook odds · Click any team for full breakdown'}
          </p>
          <StandingsTable results={results} league={league} snapshots={snapshots} config={config} />
          {importantGames.length > 0 && (
            <div className="mt-6">
              <ImportantGames games={importantGames} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
