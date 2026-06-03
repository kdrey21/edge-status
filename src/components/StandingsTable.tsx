'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SimResult } from '@/types'
import type { SnapPoint } from '@/lib/supabase'
import Sparkline from '@/components/Sparkline'

type SortKey =
  | 'wins'
  | 'playoff_pct'
  | 'championship_pct'
  | 'kalshi_champ_pct'
  | 'sportsbook_champ_pct'
  | 'champ_ev_pct'

interface Props {
  results: SimResult[]
  league: string
  /** Snapshot history keyed by team abbreviation, sorted oldest→newest */
  snapshots?: Map<string, SnapPoint[]>
}

function pctColor(pct: number | null): string {
  if (pct == null) return 'text-gray-500'
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

/** Delta indicator: value now vs 7 days ago */
function Delta({ now, then }: { now: number | null; then: number | null }) {
  if (now == null || then == null) return null
  const delta = now - then
  if (Math.abs(delta) < 0.1) return null
  const up = delta > 0
  return (
    <span
      className={`text-[10px] font-semibold ml-1 ${up ? 'text-green-400' : 'text-red-400'}`}
      title={`${up ? '+' : ''}${delta.toFixed(1)}% vs 7 days ago`}
    >
      {up ? '▲' : '▼'}{Math.abs(delta).toFixed(1)}
    </span>
  )
}

export default function StandingsTable({ results, league, snapshots }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('wins')

  const hasMarketData = results.some(
    r => r.kalshi_champ_pct != null || r.sportsbook_champ_pct != null,
  )
  const hasSimData = results.some(r => r.playoff_pct != null)
  const hasSnapshots = snapshots != null && snapshots.size > 0

  const sorted = [...results].sort((a, b) => {
    if (sortKey === 'wins') return (b.wins ?? 0) - (a.wins ?? 0)
    if (sortKey === 'kalshi_champ_pct')
      return (b.kalshi_champ_pct ?? -999) - (a.kalshi_champ_pct ?? -999)
    if (sortKey === 'sportsbook_champ_pct')
      return (b.sportsbook_champ_pct ?? -999) - (a.sportsbook_champ_pct ?? -999)
    if (sortKey === 'champ_ev_pct')
      return (b.champ_ev_pct ?? -999) - (a.champ_ev_pct ?? -999)
    return ((b[sortKey] as number) ?? -999) - ((a[sortKey] as number) ?? -999)
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
            {hasSimData && (
              <>
                {col('W', 'wins', 'text-right')}
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">L</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">GB</th>
                {col('Playoff %', 'playoff_pct', 'text-right')}
                {col('Sim Champ %', 'championship_pct', 'text-right', 'Monte Carlo simulation championship probability')}
              </>
            )}
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
          {sorted.map((r, i) => {
            const snaps = snapshots?.get(r.team) ?? []
            // Values for sparkline: use playoff_pct for in-season, kalshi_champ_pct for futures
            const sparkVals = snaps.map(s =>
              s.playoff_pct != null ? s.playoff_pct : s.kalshi_champ_pct,
            )
            // 7-day-ago value for delta indicator
            const sevenDaysAgo = snaps.length >= 2 ? snaps[0] : null

            return (
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

                {hasSimData && (
                  <>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">{r.wins ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">{r.losses ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-400 font-mono">
                      {r.games_back != null
                        ? r.games_back === 0 ? '—' : r.games_back.toFixed(1)
                        : '—'}
                    </td>

                    {/* Playoff % with sparkline + delta */}
                    <td className={`px-4 py-3 text-right font-bold text-base ${pctColor(r.playoff_pct)}`}>
                      <div className="flex items-center justify-end gap-1.5">
                        {hasSnapshots && sparkVals.length >= 2 && (
                          <Sparkline values={sparkVals} />
                        )}
                        <span>{fmt(r.playoff_pct)}</span>
                        {hasSnapshots && (
                          <Delta
                            now={r.playoff_pct}
                            then={sevenDaysAgo?.playoff_pct ?? null}
                          />
                        )}
                      </div>
                    </td>

                    <td className={`px-4 py-3 text-right font-bold ${pctColor(r.championship_pct)}`}>
                      {fmt(r.championship_pct)}
                    </td>
                  </>
                )}

                {hasMarketData && (
                  <>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Sparkline for futures-only mode (no sim data) */}
                        {!hasSimData && hasSnapshots && sparkVals.length >= 2 && (
                          <Sparkline values={sparkVals} />
                        )}
                        <span>{fmt(r.kalshi_champ_pct)}</span>
                        {!hasSimData && hasSnapshots && (
                          <Delta
                            now={r.kalshi_champ_pct}
                            then={sevenDaysAgo?.kalshi_champ_pct ?? null}
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300 font-mono">
                      {fmt(r.sportsbook_champ_pct)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-bold ${
                        r.champ_ev_pct != null ? evColor(r.champ_ev_pct) : 'text-gray-600'
                      }`}
                    >
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
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
