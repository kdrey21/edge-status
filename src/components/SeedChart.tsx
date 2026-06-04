'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function SeedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-xs shadow-xl">
      <p className="text-[#8892aa] mb-1 font-semibold">{label}</p>
      <p className="text-[#eef0f8] font-bold">{payload[0].value.toFixed(1)}% probability</p>
    </div>
  )
}

interface Props {
  seedDistribution: Record<string, number>
}

export default function SeedChart({ seedDistribution }: Props) {
  const data = Object.entries(seedDistribution)
    .map(([seed, pct]) => ({ seed: `Seed ${seed}`, pct: Number(pct.toFixed(1)) }))
    .sort((a, b) => {
      const numA = parseInt(a.seed.replace('Seed ', ''))
      const numB = parseInt(b.seed.replace('Seed ', ''))
      return numA - numB
    })

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        No seed distribution data
      </div>
    )
  }

  const barColor = (pct: number) => {
    if (pct >= 20) return '#4ade80'
    if (pct >= 10) return '#facc15'
    return '#60a5fa'
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" vertical={false} />
        <XAxis
          dataKey="seed"
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={{ stroke: '#2a2d3a' }}
          tickLine={false}
        />
        <YAxis
          tickFormatter={(v) => `${v}%`}
          tick={{ fill: '#9ca3af', fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          content={<SeedTooltip />}
          cursor={{ fill: 'rgba(255,255,255,0.06)' }}
        />
        <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
          {data.map((entry, index) => (
            <Cell key={index} fill={barColor(entry.pct)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
