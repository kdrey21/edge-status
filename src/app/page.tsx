'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { LEAGUES } from '@/types'
import { getAllLeaguesSummary, getTopEdges, type TopEdge } from '@/lib/supabase'
import LeagueCard from '@/components/LeagueCard'

const LEAGUE_NAMES: Record<string, string> = {
  nba: 'NBA', nhl: 'NHL', mlb: 'MLB', nfl: 'NFL', mls: 'MLS',
}

function EdgeRow({ edge }: { edge: TopEdge }) {
  return (
    <Link
      href={`/${edge.league}/${edge.team.toLowerCase()}`}
      className="flex items-center justify-between gap-4 py-3 px-4 rounded-lg hover:bg-white/5 transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 w-8 shrink-0">
          {LEAGUE_NAMES[edge.league] ?? edge.league.toUpperCase()}
        </span>
        <span className="font-bold text-white group-hover:text-blue-400 transition-colors">
          {edge.team}
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-sm font-mono">
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">Kalshi</p>
          <p className="text-gray-300">{edge.kalshi_champ_pct.toFixed(1)}%</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">Book</p>
          <p className="text-gray-300">{edge.sportsbook_champ_pct.toFixed(1)}%</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-600 uppercase tracking-wider">Edge</p>
          <p className="text-green-400 font-bold">+{edge.champ_ev_pct.toFixed(1)}%</p>
        </div>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-black uppercase tracking-widest bg-green-400/20 text-green-300 border border-green-400/40">
          VALUE
        </span>
      </div>
    </Link>
  )
}

export default function HomePage() {
  const [summary, setSummary] = useState<
    { league: string; count: number; updated_at: string; hasSim: boolean }[]
  >([])
  const [edges, setEdges] = useState<TopEdge[]>([])
  const [edgesLoading, setEdgesLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getAllLeaguesSummary(),
      getTopEdges(6),
    ])
      .then(([s, e]) => {
        setSummary(s)
        setEdges(e)
      })
      .catch(() => {})
      .finally(() => setEdgesLoading(false))
  }, [])

  const summaryMap = new Map(summary.map(s => [s.league, s]))

  return (
    <div>
      {/* Hero */}
      <div className="mb-10">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-400 mb-2">
          Model · Markets · Edge
        </p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white mb-3 leading-tight">
          Where Markets<br className="sm:hidden" /> Disagree Today
        </h1>
        <p className="text-gray-400 text-base max-w-xl">
          We run 50,000 season simulations daily and compare the results to Kalshi
          prediction markets and sportsbook odds — surfacing teams the market may be
          mispricing.
        </p>
      </div>

      {/* Top edges panel */}
      <div className="rounded-xl border border-surface-border bg-surface-card mb-10">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-surface-border/60">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Biggest Market Edges
            </h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              Kalshi % − Sportsbook % · Positive = books may be undervaluing
            </p>
          </div>
          <span className="text-[10px] text-gray-600 uppercase tracking-wider">Championship odds</span>
        </div>

        {edgesLoading ? (
          <div className="px-4 py-6 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 rounded bg-surface-border/40 animate-pulse" />
            ))}
          </div>
        ) : edges.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-gray-500 text-sm">No significant edges today.</p>
            <p className="text-gray-600 text-xs mt-1">Market data updates daily at 06:00 UTC.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-border/40 px-0 py-1">
            {edges.map(e => <EdgeRow key={`${e.league}-${e.team}`} edge={e} />)}
          </div>
        )}

        <div className="px-4 py-3 border-t border-surface-border/40">
          <p className="text-[10px] text-gray-600">
            EV% = Kalshi field-normalized % − de-vigged sportsbook consensus %.
            Positive EV suggests the sportsbook is underpricing the team relative to the
            prediction market. <span className="text-gray-500">Not financial advice.</span>
          </p>
        </div>
      </div>

      {/* League grid */}
      <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
        All Leagues
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LEAGUES.map(league => {
          const data = summaryMap.get(league.slug)
          const state =
            data == null || data.count === 0
              ? 'inactive'
              : data.hasSim
                ? 'active'
                : 'futures'
          return (
            <LeagueCard
              key={league.slug}
              league={league}
              state={state}
              updatedAt={data?.updated_at}
            />
          )
        })}
      </div>
    </div>
  )
}
