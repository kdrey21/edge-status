interface ScheduleGame {
  date: string
  opponent: string
  isHome: boolean
  winProb: number
}

interface Props {
  games: ScheduleGame[]
}

export default function ScheduleTable({ games }: Props) {
  if (games.length === 0) {
    return (
      <div className="text-gray-500 text-sm py-6 text-center">
        No upcoming schedule data available.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full text-sm">
        <thead className="bg-surface-card">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              Date
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
              Matchup
            </th>
            <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
              Win Prob
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {games.map((g, i) => {
            const pct = (g.winProb * 100).toFixed(0)
            const color =
              g.winProb >= 0.6
                ? 'text-green-400'
                : g.winProb >= 0.4
                ? 'text-yellow-400'
                : 'text-red-400'
            return (
              <tr key={i} className="hover:bg-surface-card/40 transition-colors">
                <td className="px-4 py-3 text-gray-400">
                  {new Date(g.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </td>
                <td className="px-4 py-3 text-white">
                  <span className="text-gray-500 mr-1">{g.isHome ? 'vs' : '@'}</span>
                  <span className="font-semibold">{g.opponent}</span>
                </td>
                <td className={`px-4 py-3 text-right font-bold ${color}`}>{pct}%</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
