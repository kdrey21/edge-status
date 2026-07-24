'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { LEAGUES } from '@/types'
import { getAllLeaguesSummary, getTopEdges, type TopEdge } from '@/lib/supabase'
import LeagueCard from '@/components/LeagueCard'
import { espnLogoUrl } from '@/lib/logos'

const LEAGUE_NAMES: Record<string, string> = {
  nba: 'NBA', nhl: 'NHL', mlb: 'MLB', nfl: 'NFL', mls: 'MLS', ncaaf: 'NCAAF',
}

// Home-page card order (NCAAF sits right under NFL, above MLS). Any league not
// listed falls to the end in its original LEAGUES order.
const HOME_LEAGUE_ORDER = ['nba', 'nhl', 'mlb', 'nfl', 'ncaaf', 'mls']
const orderedLeagues = [...LEAGUES].sort(
  (a, b) => {
    const ai = HOME_LEAGUE_ORDER.indexOf(a.slug)
    const bi = HOME_LEAGUE_ORDER.indexOf(b.slug)
    return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
  },
)

function EdgeRow({ edge }: { edge: TopEdge }) {
  return (
    <Link
      href={`/${edge.league}/${edge.team.toLowerCase()}`}
      className="flex items-center justify-between gap-4 py-3 px-4 hover:bg-surface-raised transition-colors group"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#484f6a] w-8 shrink-0">
          {LEAGUE_NAMES[edge.league] ?? edge.league.toUpperCase()}
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={espnLogoUrl(edge.league, edge.team)}
          alt=""
          width={24}
          height={24}
          className="w-6 h-6 shrink-0 object-contain"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <span className="font-display font-bold text-[#eef0f8] group-hover:text-brand transition-colors">
          {edge.team}
        </span>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-sm">
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-[#484f6a] uppercase tracking-wider">Kalshi</p>
          <p className="text-[#8892aa] font-mono">{edge.kalshi_champ_pct.toFixed(1)}%</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-[10px] text-[#484f6a] uppercase tracking-wider">Book</p>
          <p className="text-[#8892aa] font-mono">{edge.sportsbook_champ_pct.toFixed(1)}%</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#484f6a] uppercase tracking-wider">Edge</p>
          <p className="text-edge-pos font-mono font-bold">+{edge.champ_ev_pct.toFixed(1)}%</p>
        </div>
        <span className="rounded px-2 py-1 text-[10px] font-black uppercase tracking-widest bg-edge-pos/15 text-edge-pos border border-edge-pos/40">
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
        <p className="text-[10px] font-bold uppercase tracking-widest text-brand mb-3">
          Model · Markets · Edge
        </p>
        <h1 className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-[#eef0f8] mb-3 leading-tight">
          Where Futures Betting<br className="sm:hidden" /> Markets Disagree.
        </h1>
        <p className="text-[#8892aa] text-base max-w-xl leading-relaxed">
          50,000 season simulations daily. We compare the results to Kalshi
          prediction markets and sportsbook odds — surfacing teams the market
          may be mispricing.
        </p>
      </div>

      {/* Top edges panel — edge-pos glow hero */}
      <div className="rounded-xl border border-edge-pos/20 bg-surface-card shadow-edge-glow mb-10">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-surface-border">
          <div>
            <h2 className="font-display text-sm font-bold text-[#eef0f8] uppercase tracking-wider">
              Biggest Market Edges
            </h2>
            <p className="text-[11px] text-[#484f6a] mt-0.5">
              Kalshi % − Sportsbook % · Positive = books may be undervaluing
            </p>
          </div>
          <span className="text-[10px] text-[#484f6a] uppercase tracking-wider hidden sm:block">Championship odds</span>
        </div>

        {edgesLoading ? (
          <div className="px-4 py-6 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-8 rounded bg-surface-raised animate-pulse" />
            ))}
          </div>
        ) : edges.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-[#8892aa] text-sm">No significant edges today.</p>
            <p className="text-[#484f6a] text-xs mt-1">Market data updates daily at 06:00 UTC.</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-border px-0 py-1">
            {edges.map(e => <EdgeRow key={`${e.league}-${e.team}`} edge={e} />)}
          </div>
        )}

        <div className="px-4 py-3 border-t border-surface-border">
          <p className="text-[10px] text-[#484f6a]">
            EV% = Kalshi field-normalized % − de-vigged sportsbook consensus %.
            Positive EV suggests the sportsbook is underpricing the team relative to the
            prediction market. Not financial advice.
          </p>
        </div>
      </div>

      {/* League grid */}
      <h2 className="font-display text-[10px] font-bold uppercase tracking-widest text-[#484f6a] mb-4">
        All Leagues
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orderedLeagues.map(league => {
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
