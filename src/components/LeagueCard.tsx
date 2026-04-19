import Link from 'next/link'
import type { LeagueConfig } from '@/types'

const LEAGUE_ICONS: Record<string, string> = {
  nba: '🏀',
  nhl: '🏒',
  mlb: '⚾',
  nfl: '🏈',
  mls: '⚽',
}

interface Props {
  league: LeagueConfig
  active: boolean
  updatedAt?: string
}

export default function LeagueCard({ league, active, updatedAt }: Props) {
  const icon = LEAGUE_ICONS[league.slug] ?? '🏆'
  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <Link href={active ? `/${league.slug}` : '#'}>
      <div
        className={`
          rounded-xl border p-6 transition-all
          ${
            active
              ? 'border-surface-border bg-surface-card hover:border-blue-500/50 hover:bg-surface-card/80 cursor-pointer'
              : 'border-surface-border/50 bg-surface-card/40 cursor-default opacity-50'
          }
        `}
      >
        <div className="flex items-start justify-between mb-4">
          <span className="text-4xl">{icon}</span>
          <span
            className={`
              text-xs font-medium px-2 py-1 rounded-full
              ${active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-500'}
            `}
          >
            {active ? 'IN SEASON' : 'OFF SEASON'}
          </span>
        </div>
        <h2 className="text-xl font-bold text-white mb-1">{league.name}</h2>
        {formattedDate && (
          <p className="text-xs text-gray-500">Updated {formattedDate}</p>
        )}
        {!formattedDate && active && (
          <p className="text-xs text-gray-500">No sim data yet</p>
        )}
      </div>
    </Link>
  )
}
