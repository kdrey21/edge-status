'use client'

import type { ImportantGame } from '@/lib/supabase'

interface Props {
  games: ImportantGame[]
  /** If provided, highlight this team's swing in each row */
  focusTeam?: string
}

function SwingBadge({ value, label }: { value: number; label: string }) {
  if (Math.abs(value) < 0.5) return null
  const color =
    value >= 10 ? 'text-green-400' :
    value >= 5  ? 'text-yellow-400' :
    value > 0   ? 'text-gray-300'   : 'text-red-400'
  return (
    <span className={`text-xs font-semibold ${color}`}>
      {label} {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

export default function ImportantGames({ games, focusTeam }: Props) {
  if (games.length === 0) return null

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base">🎯</span>
        <h2 className="text-sm font-bold text-white uppercase tracking-wider">
          {focusTeam ? 'Your Key Upcoming Games' : 'Most Impactful Upcoming Games'}
        </h2>
      </div>

      <div className="space-y-2">
        {games.map((g, i) => {
          const date = new Date(g.game_date + 'T12:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })
          const isHomeTeamFocus = focusTeam === g.home_team
          const isAwayTeamFocus = focusTeam === g.away_team

          return (
            <div
              key={i}
              className="flex items-center justify-between gap-3 py-2 border-b border-surface-border/50 last:border-0"
            >
              {/* Rank + teams */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-gray-600 font-mono w-4 shrink-0">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    <span className={isHomeTeamFocus ? 'text-blue-400' : ''}>{g.home_team}</span>
                    <span className="text-gray-500 mx-1">vs</span>
                    <span className={isAwayTeamFocus ? 'text-blue-400' : ''}>{g.away_team}</span>
                  </p>
                  <p className="text-xs text-gray-500">{date}</p>
                </div>
              </div>

              {/* Swings */}
              <div className="flex flex-col items-end gap-0.5 shrink-0">
                <SwingBadge value={g.home_playoff_swing} label={g.home_team} />
                <SwingBadge value={g.away_playoff_swing} label={g.away_team} />
              </div>

              {/* Total impact bar */}
              <div className="shrink-0 text-right">
                <span
                  className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    g.importance_score >= 15 ? 'bg-red-500/20 text-red-300' :
                    g.importance_score >= 8  ? 'bg-amber-500/20 text-amber-300' :
                                               'bg-gray-500/10 text-gray-400'
                  }`}
                >
                  {g.importance_score.toFixed(0)}pt
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-600 mt-3">
        Impact = sum of playoff% swings for both teams if each wins. Higher = more pivotal.
      </p>
    </div>
  )
}
