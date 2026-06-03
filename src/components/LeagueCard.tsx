import Link from 'next/link'
import type { LeagueConfig } from '@/types'

const LEAGUE_ICONS: Record<string, string> = {
  nba: '🏀',
  nhl: '🏒',
  mlb: '⚾',
  nfl: '🏈',
  mls: '⚽',
}

// 'active'  — in-season, full sim data
// 'futures' — off-season, market data only (Kalshi + sportsbook futures)
// 'inactive' — no data at all
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
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  const badge =
    state === 'active'
      ? { label: 'IN SEASON', cls: 'bg-green-500/20 text-green-400' }
      : state === 'futures'
        ? { label: 'FUTURES', cls: 'bg-amber-500/20 text-amber-400' }
        : { label: 'OFF SEASON', cls: 'bg-gray-500/20 text-gray-500' }

  const cardCls =
    state === 'active'
      ? 'border-surface-border bg-surface-card hover:border-blue-500/50 hover:bg-surface-card/80 cursor-pointer'
      : state === 'futures'
        ? 'border-surface-border bg-surface-card hover:border-amber-500/30 hover:bg-surface-card/80 cursor-pointer'
        : 'border-surface-border/50 bg-surface-card/40 cursor-default opacity-50'

  return (
    <Link href={isClickable ? `/${league.slug}` : '#'}>
      <div className={`rounded-xl border p-6 transition-all ${cardCls}`}>
        <div className="flex items-start justify-between mb-4">
          <span className="text-4xl">{icon}</span>
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">{league.name}</h2>
        {formattedDate && (
          <p className="text-xs text-gray-500">Updated {formattedDate}</p>
        )}
        {!formattedDate && isClickable && (
          <p className="text-xs text-gray-500">
            {state === 'futures' ? 'Championship futures only' : 'No sim data yet'}
          </p>
        )}
      </div>
    </Link>
  )
}
