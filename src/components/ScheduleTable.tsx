interface ScheduleGame {
  date: string
  opponent: string
  isHome: boolean
  winProb: number
  /** Playoff % swing for this team if they win vs lose this game (from game_importance) */
  playoffSwing?: number | null
}

interface Props {
  games: ScheduleGame[]
  /** Cap displayed rows (default: show all) */
  limit?: number
}

export default function ScheduleTable({ games, limit }: Props) {
  const rows = limit != null ? games.slice(0, limit) : games
  const hasSwing = rows.some(g => g.playoffSwing != null)

  if (rows.length === 0) {
    return (
      <div className="text-[#484f6a] text-sm py-6 text-center">
        No upcoming schedule data available.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-border">
            <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">
              Date
            </th>
            <th className="pb-2 text-left text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">
              Opponent
            </th>
            <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">
              Win Prob
            </th>
            {hasSwing && (
              <th className="pb-2 text-right text-[10px] font-bold uppercase tracking-wider text-[#484f6a]">
                Playoff Swing
              </th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {rows.map((g, i) => {
            const pct = (g.winProb * 100).toFixed(0)
            const winColor =
              g.winProb >= 0.6 ? 'text-playoff-high'
              : g.winProb >= 0.4 ? 'text-playoff-mid'
              : 'text-playoff-low'

            const swing = g.playoffSwing ?? null
            const swingColor =
              swing == null ? 'text-[#484f6a]'
              : swing >= 10 ? 'text-edge-pos'
              : swing >= 5  ? 'text-playoff-mid'
              : swing > 0   ? 'text-[#8892aa]'
              : 'text-edge-neg'

            return (
              <tr key={i} className="hover:bg-surface-raised transition-colors">
                <td className="py-2.5 text-[#8892aa] font-mono text-xs">
                  {new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
                <td className="py-2.5 text-white">
                  <span className="text-[#484f6a] mr-1.5 text-xs">{g.isHome ? 'vs' : '@'}</span>
                  <span className="font-bold">{g.opponent}</span>
                </td>
                <td className={`py-2.5 text-right font-bold font-mono ${winColor}`}>
                  {pct}%
                </td>
                {hasSwing && (
                  <td className={`py-2.5 text-right font-bold font-mono text-xs ${swingColor}`}>
                    {swing != null
                      ? (swing > 0 ? '+' : '') + swing.toFixed(1) + '%'
                      : <span className="text-[#484f6a]">—</span>}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
