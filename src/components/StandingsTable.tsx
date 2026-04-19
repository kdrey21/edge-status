'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SimResult } from '@/types'

type SortKey = 'playoff_pct' | 'div_title_pct' | 'championship_pct'

interface Props {
  results: SimResult[]
  league: string
}

function pctColor(pct: number): string {
  if (pct >= 60) return 'text-green-400'
  if (pct >= 40) return 'text-yellow-400'
  return 'text-red-400'
}

function fmt(n: number): string {
  return n.toFixed(1) + '%'
}

export default function StandingsTable({ results, league }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('playoff_pct')

  const sorted = [...results].sort((a, b) => b[sortKey] - a[sortKey])

  const col = (label: string, key: SortKey) => (
    <th
      className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap
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
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
              W
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
              L
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
              GB
            </th>
            {col('Playoff %', 'playoff_pct')}
            {col('Div Title %', 'div_title_pct')}
            {col('Champ %', 'championship_pct')}
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
              <td className="px-4 py-3 text-right text-gray-300">—</td>
              <td className="px-4 py-3 text-right text-gray-300">—</td>
              <td className="px-4 py-3 text-right text-gray-300">—</td>
              <td className={`px-4 py-3 text-right font-bold text-base ${pctColor(r.playoff_pct)}`}>
                {fmt(r.playoff_pct)}
              </td>
              <td className={`px-4 py-3 text-right font-bold ${pctColor(r.div_title_pct)}`}>
                {fmt(r.div_title_pct)}
              </td>
              <td className={`px-4 py-3 text-right font-bold ${pctColor(r.championship_pct)}`}>
                {fmt(r.championship_pct)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
