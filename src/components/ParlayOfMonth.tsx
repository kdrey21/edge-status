'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { espnLogoUrl } from '@/lib/logos'
import { formatAmerican, parlayMonthLabel, type ParlayOfMonth as Parlay } from '@/lib/parlay'

const LEAGUE_LABEL: Record<string, string> = {
  nfl: 'NFL', nba: 'NBA', nhl: 'NHL', mlb: 'MLB',
}

export default function ParlayOfMonth({ parlay }: { parlay: Parlay }) {
  const payout = Math.round(parlay.payout_per_100)
  const cardRef = useRef<HTMLDivElement>(null)
  const [saving, setSaving] = useState(false)

  // Exact pick date, captured on the banner for the timestamped share image.
  const lockedDate = new Date(parlay.generated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  async function saveImage() {
    if (!cardRef.current) return
    setSaving(true)
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0a0b0f',
        filter: (node) => !(node instanceof HTMLElement && node.dataset.noexport != null),
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `parlay-${parlay.month_key}.png`
      a.click()
    } catch {
      /* best-effort; card stays on screen */
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      ref={cardRef}
      className="rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/[0.08] via-surface-card to-surface-card shadow-card mb-10 overflow-hidden"
    >
      <div className="flex flex-col lg:flex-row lg:items-center gap-4 px-4 py-3">
        {/* Label */}
        <div className="shrink-0 lg:w-44">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">
            🎟 Parlay of the Month
          </p>
          <p className="text-[11px] text-[#8892aa] mt-0.5">{parlayMonthLabel(parlay.month_key)}</p>
          <p className="text-[10px] text-[#484f6a] mt-0.5">Locked {lockedDate}</p>
        </div>

        {/* Legs */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 flex-1 min-w-0">
          {parlay.legs.map((leg, i) => (
            <div key={leg.league} className="flex items-center gap-2">
              {i > 0 && <span className="text-[#484f6a] font-mono text-xs">×</span>}
              <Link
                href={`/${leg.league}/${leg.team.toLowerCase()}`}
                className="flex items-center gap-1.5 group"
                title={`${LEAGUE_LABEL[leg.league]} · Kalshi ${leg.kalshi_pct.toFixed(1)}% vs book ${leg.book_pct.toFixed(1)}% · edge ${leg.edge_pct >= 0 ? '+' : ''}${leg.edge_pct.toFixed(1)}%`}
              >
                <span className="text-[9px] font-bold uppercase tracking-wider text-[#484f6a] w-7 shrink-0">
                  {LEAGUE_LABEL[leg.league] ?? leg.league.toUpperCase()}
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={espnLogoUrl(leg.league, leg.team)}
                  alt=""
                  width={20}
                  height={20}
                  className="w-5 h-5 shrink-0 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                <span className="font-display font-bold text-sm text-[#eef0f8] group-hover:text-amber-400 transition-colors">
                  {leg.team}
                </span>
                <span className="font-mono text-xs text-amber-400/90">{formatAmerican(leg.american_odds)}</span>
              </Link>
            </div>
          ))}
        </div>

        {/* Payout */}
        <div className="shrink-0 text-left lg:text-right border-t lg:border-t-0 lg:border-l border-surface-border pt-2 lg:pt-0 lg:pl-4">
          <p className="text-[10px] uppercase tracking-wider text-[#484f6a]">$100 pays</p>
          <p className="font-display font-bold text-2xl text-amber-400 leading-tight">
            ${payout.toLocaleString()}
          </p>
          <p className="text-[10px] text-[#484f6a]">
            {formatAmerican(parlay.combined_american)} · {parlay.combined_implied_pct.toFixed(2)}% implied
          </p>
          <button
            data-noexport
            onClick={saveImage}
            disabled={saving}
            className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-400/80 hover:text-amber-400 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : '⤓ Save image'}
          </button>
        </div>
      </div>

      <p className="px-4 pb-2 text-[10px] text-[#484f6a]">
        One highest-edge champion pick per league (Kalshi vs. sportsbook), priced at the shorter of
        DraftKings / FanDuel. Model portfolio — legs resolve at different times, not a single-slip bet.
        Not financial advice.
      </p>
    </div>
  )
}
