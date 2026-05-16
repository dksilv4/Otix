import { useId } from "react"
import { cn } from "@/lib/utils"

interface DataPoint {
  label: string
  value: number
}

interface LineChartProps {
  data: DataPoint[]
  color?: string
  height?: number
}

const PAD_LEFT = 44
const PAD_RIGHT = 8
const PAD_TOP = 8
const PAD_BOTTOM = 22
const VIEWBOX_W = 600
const VIEWBOX_H = 180

export function LineChart({ data, color = "var(--primary)", height = 180 }: LineChartProps) {
  const gradientId = useId()

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-xs text-muted-foreground"
        style={{ height }}
      >
        No data yet
      </div>
    )
  }

  const maxVal = Math.max(...data.map((d) => d.value), 1)
  const chartW = VIEWBOX_W - PAD_LEFT - PAD_RIGHT
  const chartH = VIEWBOX_H - PAD_TOP - PAD_BOTTOM

  const x = (i: number) => PAD_LEFT + (data.length > 1 ? (i / (data.length - 1)) * chartW : chartW / 2)
  const y = (v: number) => PAD_TOP + chartH - (v / maxVal) * chartH

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`)
    .join(" ")

  const areaPath = `${linePath} L ${x(data.length - 1).toFixed(1)} ${PAD_TOP + chartH} L ${x(0).toFixed(1)} ${PAD_TOP + chartH} Z`

  // Only show ~5 x-axis labels to avoid crowding
  const labelInterval = Math.max(1, Math.floor(data.length / 5))
  const xLabels = data.filter((_, i) => i % labelInterval === 0 || i === data.length - 1)

  return (
    <div
      className="relative rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] overflow-hidden"
      style={{ height }}
    >
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        preserveAspectRatio="none"
      >
        {/* Y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const val = maxVal * frac
          const label = val >= 1_000_000 ? (val / 1_000_000).toFixed(1) + "M"
            : val >= 1_000 ? (val / 1_000).toFixed(1) + "k"
            : val.toFixed(0)
          return (
            <text
              key={frac}
              x={PAD_LEFT - 6}
              y={y(val) + 3}
              textAnchor="end"
              className="text-[9px] fill-current text-muted-foreground/50"
              fontFamily="system-ui, sans-serif"
            >
              {label}
            </text>
          )
        })}

        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => (
          <line
            key={frac}
            x1={PAD_LEFT}
            y1={y(maxVal * frac)}
            x2={PAD_LEFT + chartW}
            y2={y(maxVal * frac)}
            stroke="currentColor"
            className="text-white/[0.04]"
            strokeWidth={1}
          />
        ))}

        {/* Area fill */}
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.15} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Dots */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(d.value)}
            r={2.5}
            fill={color}
            className="transition-opacity"
          />
        ))}
      </svg>

      {/* X-axis labels overlay */}
      <div
        className="absolute bottom-1 flex justify-between"
        style={{ left: `${(PAD_LEFT / VIEWBOX_W) * 100}%`, right: `${(PAD_RIGHT / VIEWBOX_W) * 100}%` }}
      >
        {xLabels.map((d, i) => (
          <span
            key={i}
            className="text-[9px] text-muted-foreground/60 tabular-nums leading-none whitespace-nowrap"
          >
            {formatLabel(d.label, data)}
          </span>
        ))}
      </div>
    </div>
  )
}

function formatLabel(label: string, allData: DataPoint[]): string {
  const d = new Date(label.replace(" ", "T"))
  if (isNaN(d.getTime())) return label

  const hasTime = label.includes(" ")
  if (!hasTime) {
    // Day-level: "2026-05-16" → "May 16"
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  // Check if all labels share the same date — if so, show only time
  const allSameDay = allData.every((p) => p.label.slice(0, 10) === label.slice(0, 10))
  if (allSameDay) {
    return label.slice(11, 16) // "HH:MI"
  }

  // Spanning multiple days — show "Mon DD HH:MI"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + label.slice(11, 16)
}
