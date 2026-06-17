import { useEffect, useState } from 'react'

interface XPProgressRingProps {
  progress: number
  size: number
  strokeWidth?: number
  strokeColor?: string
  children: React.ReactNode
}

export function XPProgressRing({
  progress,
  size,
  strokeWidth = 3,
  strokeColor = 'var(--primary)',
  children,
}: XPProgressRingProps) {
  const [animProgress, setAnimProgress] = useState(0)

  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimProgress(progress))
    return () => cancelAnimationFrame(id)
  }, [progress])

  const radius = size / 2 - strokeWidth
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - animProgress)

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        className="absolute inset-0 -rotate-90"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeWidth}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {children}
      </div>
    </div>
  )
}
