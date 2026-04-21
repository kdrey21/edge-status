'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SimResult } from '@/types'

type SortKey = 'playoff_pct' | 'div_title_pct' | 'championship_pct' | 'edge_pct' | 'wins'

interface Props {
  results: SimResult[]
  league: string
  showEdge?: boolean
}

function pctColor(pct: number): string {
  if (pct >= 60) return 'text-green-400'
  if (pct >= 40) return 'text-yellow-400'
  return 'text-red-400'
}

function edgeColor(edge: number): string {
  if (edge > 5) return 'text-green-400'
  if (edge < -5) return 'text-red-400'
  return 'text-gray-400'
}

function fmt(n: number): string {
  return n.toFixed(1) + '%'
}

export default function StandingsTable({ results, league, showEdge = false }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('wins')

  const sorted = [...results].sort((a, b) => {
    if (sortKey === 'wins') return (b.wins ?? 0) - (a.wins ?? 0)
    if (sortKey === 'edge_pct') return (b.edge_pct ?? -999) - (a.edge_pct ?? -999)
    return b[sortKey] - a[sortKey]
  })

  const col = (label: string, key: SortKey, align = 'text-right') => (
    <th
      className={`px-4 py-3 ${align} text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap
        ${sortKey === key ? 'text-blue-400' : 'text-gray-400 hover:text-gray-200'}`}
      onClick={() => setSortKey(key)}
    >
      {label} {sortKey === key ? '↓' : ''}
    </th>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-card sticky top-0">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              Team
            </th>
            {col('W', 'wins')}
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">L</th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">GB</th>
            {col('Playoff %', 'playoff_pct')}
            {col('Div Title %', 'div_title_pct')}
            {col('Champ %', 'championship_pct')}
            {showEdge && col('Edge', 'edge_pct')}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {sorted.map((r, i) => (
            <tr
              key={r.team}
              className={`transition-colors hover:bg-surface-card/60 ${i % 2 === 0 ? 'bg-transparent' : 'bg-surface-card/20'}`}
            >
              <td className="px-4 py-3">
                <Link
                  href={`/${league}/${r.team.toLowerCase()}`}
                  className="font-semibold text-white hover:text-blue-400 transition-colors"
                >
                  {r.team}
                </Link>
              </td>
              <td className="px-4 py-3 text-right text-gray-300 font-mono">{r.wins ?? '—'}</td>
              <td className="px-4 py-3 text-right text-gray-300 font-mono">{r.losses ?? '—'}</td>
              <td className="px-4 py-3 text-right text-gray-400 font-mono">
                {r.games_back != null ? (r.games_back === 0 ? '—' : r.games_back.toFixed(1)) : '—'}
              </td>
              <td className={`px-4 py-3 text-right font-bold text-base ${pctColor(r.playoff_pct)}`}>
                {fmt(r.playoff_pct)}
              </td>
              <td className={`px-4 py-3 text-right font-bold ${pctColor(r.div_title_pct)}`}>
                {fmt(r.div_title_pct)}
              </td>
              <td className={`px-4 py-3 text-right font-bold ${pctColor(r.championship_pct)}`}>
                {fmt(r.championship_pct)}
              </td>
              {showEdge && (
                <td className={`px-4 py-3 text-right font-bold ${r.edge_pct != null ? edgeColor(r.edge_pct) : 'text-gray-600'}`}>
                  {r.edge_pct != null ? (r.edge_pct > 0 ? '+' : '') + fmt(r.edge_pct) : 'N/A'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
