'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { SnapPoint } from '@/lib/supabase'

interface Props {
  snapshots: SnapPoint[]
  /** Show playoff_pct line (in-season) */
  showPlayoff?: boolean
  /** Show championship_pct line */
  showChamp?: boolean
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-surface-border bg-gray-900 px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{label}</p>
      {payload.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value.toFixed(1)}%
        </p>
      ))}
    </div>
  )
}

export default function TrendChart({ snapshots, showPlayoff = true, showChamp = true }: Props) {
  if (snapshots.length < 2) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        Not enough data yet — trend builds up over daily sim runs.
      </p>
    )
  }

  const hasKalshi = snapshots.some(s => s.kalshi_champ_pct != null)
  const hasPlayoff = showPlayoff && snapshots.some(s => s.playoff_pct != null)
  const hasChamp = showChamp && snapshots.some(s => s.championship_pct != null)

  const data = snapshots.map(s => ({
    date: fmtDate(s.snap_date),
    ...(hasPlayoff && s.playoff_pct != null ? { 'Playoff %': +s.playoff_pct.toFixed(1) } : {}),
    ...(hasChamp && s.championship_pct != null ? { 'Sim Champ %': +s.championship_pct.toFixed(1) } : {}),
    ...(hasKalshi && s.kalshi_champ_pct != null ? { 'Kalshi %': +s.kalshi_champ_pct.toFixed(1) } : {}),
  }))

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3a" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: '#6b7280', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => `${v}%`}
          domain={['auto', 'auto']}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: '11px', color: '#9ca3af', paddingTop: '8px' }}
        />
        {hasPlayoff && (
          <Line
            type="monotone"
            dataKey="Playoff %"
            stroke="#60a5fa"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        )}
        {hasChamp && (
          <Line
            type="monotone"
            dataKey="Sim Champ %"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        )}
        {hasKalshi && (
          <Line
            type="monotone"
            dataKey="Kalshi %"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  )
}
