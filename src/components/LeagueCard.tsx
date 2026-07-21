import Link from 'next/link'
import type { LeagueConfig } from '@/types'

const LEAGUE_ICONS: Record<string, string> = {
  nba: '🏀',
  nhl: '🏒',
  mlb: '⚾',
  nfl: '🏈',
  mls: '⚽',
  ncaaf: '🏈',
}

type LeagueState = 'active' | 'futures' | 'inactive'

interface Props {
  league: LeagueConfig
  state: LeagueState
  updatedAt?: string
}

export default function LeagueCard({ league, state, updatedAt }: Props) {
  const icon = LEAGUE_ICONS[league.slug] ?? '🏆'
  const isClickable = state !== 'inactive'

  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : null

  const badge =
    state === 'active'
      ? { label: 'In Season', cls: 'bg-edge-pos/15 text-edge-pos border-edge-pos/30' }
      : state === 'futures'
        ? { label: 'Futures', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' }
        : { label: 'Off Season', cls: 'bg-surface-raised text-[#484f6a] border-surface-border' }

  const cardCls = isClickable
    ? 'border-surface-border bg-surface-card shadow-card hover:bg-surface-raised hover:border-brand/30 hover:shadow-card-lg cursor-pointer'
    : 'border-surface-border/50 bg-surface-card/40 cursor-default opacity-40'

  return (
    <Link href={isClickable ? `/${league.slug}` : '#'}>
      <div className={`rounded-xl border p-6 transition-all duration-200 ${cardCls}`}>
        <div className="flex items-start justify-between mb-4">
          <span className="text-3xl">{icon}</span>
          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full border ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <h2 className="font-display text-xl font-bold text-[#eef0f8] mb-1">{league.name}</h2>
        {formattedDate
          ? <p className="text-[11px] text-[#484f6a]">Updated {formattedDate}</p>
          : isClickable
            ? <p className="text-[11px] text-[#484f6a]">{state === 'futures' ? 'Championship futures' : 'No sim data yet'}</p>
            : null
        }
      </div>
    </Link>
  )
}
