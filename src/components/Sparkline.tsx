/**
 * Tiny inline SVG sparkline for showing a metric trend over time.
 * Renders nothing if fewer than 2 valid data points exist.
 */

interface SparklineProps {
  /** Ordered values, oldest first. Nulls are skipped. */
  values: (number | null)[]
  width?: number
  height?: number
  /** Override stroke color — defaults to green/red/gray based on trend direction */
  color?: string
}

export default function Sparkline({
  values,
  width = 56,
  height = 18,
  color,
}: SparklineProps) {
  const valid = values.filter((v): v is number => v != null)
  if (valid.length < 2) return null

  const min = Math.min(...valid)
  const max = Math.max(...valid)
  const range = max - min || 1

  const pts = valid
    .map((v, i) => {
      const x = (i / (valid.length - 1)) * width
      const y = height - ((v - min) / range) * (height - 2) - 1 // 1px padding top/bottom
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const trend = valid[valid.length - 1] - valid[0]
  const stroke =
    color ??
    (trend > 1 ? '#4ade80' : trend < -1 ? '#f87171' : '#6b7280')

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="inline-block align-middle"
      aria-hidden="true"
    >
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
    </svg>
  )
}
