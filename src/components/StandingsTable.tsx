'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { SimResult, LeagueConfig } from '@/types'
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
  /** League config — when present, teams are grouped by conference */
  config?: LeagueConfig
}

function pctColor(pct: number | null): string {
  if (pct == null) return 'text-[#484f6a]'
  if (pct >= 60) return 'text-playoff-high'
  if (pct >= 40) return 'text-playoff-mid'
  return 'text-playoff-low'
}

function evColor(ev: number): string {
  if (ev > 3)  return 'text-edge-pos'
  if (ev < -3) return 'text-edge-neg'
  return 'text-[#8892aa]'
}

function fmt(n: number | null, decimals = 1): string {
  if (n == null) return '—'
  // Cap at >99% — "100.0%" looks wrong to users even when technically accurate
  if (n >= 99.95) return '>99%'
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

export default function StandingsTable({ results, league, snapshots, config }: Props) {
  const hasMarketData = results.some(
    r => r.kalshi_champ_pct != null || r.sportsbook_champ_pct != null,
  )
  const hasSimData = results.some(r => r.playoff_pct != null)
  const hasSnapshots = snapshots != null && snapshots.size > 0

  // Default sort: playoff_pct for active leagues, sportsbook odds for futures-only
  const defaultSort: SortKey = hasSimData ? 'playoff_pct' : 'sportsbook_champ_pct'
  const [sortKey, setSortKey] = useState<SortKey>(defaultSort)

  function sortRows(rows: SimResult[]): SimResult[] {
    return [...rows].sort((a, b) => {
      if (sortKey === 'wins') return (b.wins ?? 0) - (a.wins ?? 0)
      if (sortKey === 'kalshi_champ_pct')
        return (b.kalshi_champ_pct ?? -999) - (a.kalshi_champ_pct ?? -999)
      if (sortKey === 'sportsbook_champ_pct')
        return (b.sportsbook_champ_pct ?? -999) - (a.sportsbook_champ_pct ?? -999)
      if (sortKey === 'champ_ev_pct')
        return (b.champ_ev_pct ?? -999) - (a.champ_ev_pct ?? -999)
      return ((b[sortKey] as number) ?? -999) - ((a[sortKey] as number) ?? -999)
    })
  }

  // Group by conference when config provides a conferenceMap
  const conferenceGroups: Array<{ conf: string; rows: SimResult[] }> = (() => {
    const cmap = config?.conferenceMap
    if (!cmap) return [{ conf: '', rows: sortRows(results) }]

    // Collect unique conferences in alphabetical order (AL < NL, AFC < NFC, East < West)
    const confs = [...new Set(results.map(r => cmap[r.team] ?? 'Other'))].sort()
    return confs.map(conf => ({
      conf,
      rows: sortRows(results.filter(r => (cmap[r.team] ?? 'Other') === conf)),
    }))
  })()

  const col = (
    label: string,
    key: SortKey,
    align = 'text-right',
    title?: string,
  ) => (
    <th
      title={title}
      className={`px-3 py-3 ${align} text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap
        ${sortKey === key ? 'text-brand' : 'text-[#484f6a] hover:text-[#8892aa]'}`}
      onClick={() => setSortKey(key)}
    >
      {label}{sortKey === key ? ' ↓' : ''}
    </th>
  )

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border shadow-card">
      <table className="w-full text-sm">
        <thead className="bg-surface-card border-b border-surface-border">
          <tr>
            {/* Sticky team column */}
            <th className="sticky left-0 z-10 bg-surface-card px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">
              Team
            </th>
            {hasSimData && (
              <>
                {col('W', 'wins', 'text-right')}
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">L</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">GB</th>
                {hasSnapshots && (
                  <th className="px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">
                    Trend
                  </th>
                )}
                {col('Playoff %', 'playoff_pct', 'text-right')}
                {col('Sim Champ %', 'championship_pct', 'text-right', 'Monte Carlo simulation championship probability')}
              </>
            )}
            {hasMarketData && (
              <>
                {col('Kalshi %', 'kalshi_champ_pct', 'text-right', 'Kalshi prediction market — field-normalized championship %')}
                {col('Book %', 'sportsbook_champ_pct', 'text-right', 'Sportsbook consensus — de-vigged championship % (Odds API)')}
                {col('EV%', 'champ_ev_pct', 'text-right', 'EV% = Kalshi − Book. Positive = books may be undervaluing.')}
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {conferenceGroups.map(({ conf, rows }) => (
            <>
              {/* Conference header row */}
              {conf && (
                <tr key={`hdr-${conf}`} className="bg-surface-raised/60">
                  <td
                    colSpan={99}
                    className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#484f6a]"
                  >
                    {conf}
                  </td>
                </tr>
              )}

              {rows.map((r, i) => {
                const snaps = snapshots?.get(r.team) ?? []
                const sparkVals = snaps.map(s =>
                  s.playoff_pct != null ? s.playoff_pct : s.kalshi_champ_pct,
                )
                const sevenDaysAgo = snaps.length >= 2 ? snaps[0] : null

                return (
                  <tr
                    key={r.team}
                    className={`transition-colors hover:bg-surface-raised ${i % 2 === 0 ? '' : 'bg-surface-card/30'}`}
                  >
                    {/* Sticky team name */}
                    <td className={`sticky left-0 z-10 px-4 py-3 ${i % 2 === 0 ? 'bg-surface' : 'bg-[#0e1019]'}`}>
                      <Link
                        href={`/${league}/${r.team.toLowerCase()}`}
                        className="font-display font-bold text-[#eef0f8] hover:text-brand transition-colors"
                      >
                        {r.team}
                      </Link>
                    </td>

                    {hasSimData && (
                      <>
                        <td className="px-3 py-3 text-right text-[#8892aa] font-mono text-sm">{r.wins ?? '—'}</td>
                        <td className="px-3 py-3 text-right text-[#8892aa] font-mono text-sm">{r.losses ?? '—'}</td>
                        <td className="px-3 py-3 text-right text-[#484f6a] font-mono text-sm">
                          {r.games_back != null
                            ? r.games_back === 0 ? '—' : r.games_back.toFixed(1)
                            : '—'}
                        </td>

                        {hasSnapshots && (
                          <td className="px-3 py-3 text-right">
                            {sparkVals.length >= 2
                              ? <Sparkline values={sparkVals} />
                              : <span className="text-[#484f6a] text-xs">—</span>
                            }
                          </td>
                        )}
                        <td className={`px-3 py-3 text-right font-bold text-sm ${pctColor(r.playoff_pct)}`}>
                          <div className="flex items-center justify-end gap-1">
                            <span>{fmt(r.playoff_pct)}</span>
                            {hasSnapshots && (
                              <Delta
                                now={r.playoff_pct}
                                then={sevenDaysAgo?.playoff_pct ?? null}
                              />
                            )}
                          </div>
                        </td>
                        <td className={`px-3 py-3 text-right font-mono text-sm ${pctColor(r.championship_pct)}`}>
                          {fmt(r.championship_pct)}
                        </td>
                      </>
                    )}

                    {hasMarketData && (
                      <>
                        <td className="px-3 py-3 text-right text-[#8892aa] font-mono text-sm">
                          <div className="flex items-center justify-end gap-1.5">
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
                        <td className="px-3 py-3 text-right text-[#8892aa] font-mono text-sm">
                          {fmt(r.sportsbook_champ_pct)}
                        </td>
                        <td className={`px-3 py-3 text-right font-bold text-sm ${
                          r.champ_ev_pct != null ? evColor(r.champ_ev_pct) : 'text-[#484f6a]'
                        }`}>
                          <div className="flex items-center justify-end gap-2">
                            <span className="font-mono">{fmtEv(r.champ_ev_pct)}</span>
                            {r.champ_ev_pct != null && r.champ_ev_pct > 3 && (
                              <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-widest bg-edge-pos/15 text-edge-pos border border-edge-pos/40">
                                VALUE
                              </span>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
