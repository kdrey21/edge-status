'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SimResult } from '@/types'

type SortKey =
  | 'wins'
  | 'playoff_pct'
  | 'div_title_pct'
  | 'championship_pct'
  | 'kalshi_champ_pct'
  | 'sportsbook_champ_pct'
  | 'champ_ev_pct'

interface Props {
  results: SimResult[]
  league: string
}

function pctColor(pct: number): string {
  if (pct >= 60) return 'text-green-400'
  if (pct >= 40) return 'text-yellow-400'
  return 'text-red-400'
}

function evColor(ev: number): string {
  if (ev > 5) return 'text-green-400'
  if (ev < -5) return 'text-red-400'
  return 'text-gray-400'
}

function fmt(n: number | null, decimals = 1): string {
  if (n == null) return '—'
  return n.toFixed(decimals) + '%'
}

function fmtEv(n: number | null): string {
  if (n == null) return '—'
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%'
}

export default function StandingsTable({ results, league }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('wins')

  // Show market columns only when at least one team has data
  const hasMarketData = results.some(
    r => r.kalshi_champ_pct != null || r.sportsbook_champ_pct != null,
  )

  const sorted = [...results].sort((a, b) => {
    if (sortKey === 'wins') return (b.wins ?? 0) - (a.wins ?? 0)
    if (sortKey === 'kalshi_champ_pct')
      return (b.kalshi_champ_pct ?? -999) - (a.kalshi_champ_pct ?? -999)
    if (sortKey === 'sportsbook_champ_pct')
      return (b.sportsbook_champ_pct ?? -999) - (a.sportsbook_champ_pct ?? -999)
    if (sortKey === 'champ_ev_pct')
      return (b.champ_ev_pct ?? -999) - (a.champ_ev_pct ?? -999)
    return (b[sortKey] as number) - (a[sortKey] as number)
  })

  const col = (
    label: string,
    key: SortKey,
    align = 'text-right',
    title?: string,
  ) => (
    <th
      title={title}
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
            {col('W', 'wins', 'text-right')}
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
              L
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
              GB
            </th>
            {col('Playoff %', 'playoff_pct', 'text-right')}
            {col('Div %', 'div_title_pct', 'text-right')}
            {col('Sim Champ %', 'championship_pct', 'text-right', 'Monte Carlo simulation championship probability')}
            {hasMarketData && (
              <>
                {col('Kalshi %', 'kalshi_champ_pct', 'text-right', 'Kalshi prediction market — field-normalized championship %')}
                {col('Book %', 'sportsbook_champ_pct', 'text-right', 'Sportsbook consensus — multiplicatively de-vigged championship % (Odds API)')}
                {col('EV%', 'champ_ev_pct', 'text-right', 'EV% = Kalshi % − Book %. Positive = sportsbook undervaluing vs prediction market.')}
              </>
            )}
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
              <td className="px-4 py-3 text-right text-gray-300 font-mono">
                {r.wins ?? '—'}
              </td>
              <td className="px-4 py-3 text-right text-gray-300 font-mono">
                {r.losses ?? '—'}
              </td>
              <td className="px-4 py-3 text-right text-gray-400 font-mono">
                {r.games_back != null
                  ? r.games_back === 0
                    ? '—'
                    : r.games_back.toFixed(1)
                  : '—'}
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
              {hasMarketData && (
                <>
                  <td className="px-4 py-3 text-right text-gray-300 font-mono">
                    {fmt(r.kalshi_champ_pct)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 font-mono">
                    {fmt(r.sportsbook_champ_pct)}
                  </td>
                  <td className={`px-4 py-3 text-right font-bold ${r.champ_ev_pct != null ? evColor(r.champ_ev_pct) : 'text-gray-600'}`}>
                    <span>{fmtEv(r.champ_ev_pct)}</span>
                    {r.champ_ev_pct != null && r.champ_ev_pct > 5 && (
                      <span className="ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest bg-green-400/20 text-green-300 border border-green-400/40">
                        VALUE
                      </span>
                    )}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
