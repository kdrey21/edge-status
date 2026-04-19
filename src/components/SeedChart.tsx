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
          contentStyle={{
            backgroundColor: '#1a1d27',
            border: '1px solid #2a2d3a',
            borderRadius: '8px',
            color: '#fff',
          }}
          formatter={(value: number) => [`${value}%`, 'Probability']}
          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
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
