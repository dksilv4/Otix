import { useMemo } from 'react'
import type { LevelTier } from '../../constants'
import { computeGamification } from '../../utils'

export interface UserXpProgressionBarProps {
  currentXp?: number
  totalXp?: number
  level?: number
  tier: LevelTier
  levelTitle?: string
  xpToNextLevel?: number
  xpRank?: number | null
  xpPercentile?: number | null
  className?: string
}

export const UserXpProgressionBar = ({
  currentXp,
  totalXp,
  level: propLevel,
  tier,
  levelTitle: propLevelTitle,
  xpToNextLevel: propXpToNextLevel,
  xpRank,
  xpPercentile,
  className,
}: UserXpProgressionBarProps) => {
  const effectiveXp = totalXp ?? currentXp ?? 0
  const gamification = useMemo(() => computeGamification(effectiveXp), [effectiveXp])
  const level = propLevel ?? gamification.level
  const levelTitle = propLevelTitle ?? gamification.levelTitle
  const barProgress = gamification.xpProgress
  const totalFloor = (level - 1) * 300
  const totalCeil = propXpToNextLevel != null ? effectiveXp + propXpToNextLevel : totalFloor + 300

  return (
    <div
      className={`relative rounded-2xl ${className ?? ''}`}
      style={{
        animation: 'profileFadeIn 0.4s ease-out both',
        animationDelay: '300ms',
        boxShadow: tier.hasGlow ? `0 0 24px ${tier.glow}` : undefined,
      }}
    >
      <div className="relative h-14 rounded-2xl overflow-hidden bg-[var(--dk-surface-ghost)] backdrop-blur-xl shadow-md">
        {/* Fluid gradient fill with tier highlight */}
        <div
          className="absolute inset-y-0 left-0 rounded-2xl transition-all duration-1000 ease-out"
          style={{
            width: `${Math.max(barProgress * 100, 2)}%`,
            background: `linear-gradient(90deg, ${tier.barColor}, ${tier.color})`,
            opacity: 0.85,
          }}
        />

        {/* Dynamic glowing tip pulse at edge of progress */}
        <div
          className="absolute inset-y-0 w-2 pointer-events-none transition-all duration-1000 ease-out blur-[2px]"
          style={{
            left: `calc(${Math.min(Math.max(barProgress * 100, 2), 99)}% - 4px)`,
            background: tier.color,
            opacity: 0.8,
          }}
        />

        {/* Continuous fluid shimmer beam across the progress */}
        <div
          className="absolute inset-y-0 left-0 overflow-hidden pointer-events-none"
          style={{ width: `${Math.max(barProgress * 100, 2)}%` }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
              animation: 'fluidShimmer 2.4s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            }}
          />
        </div>

        {/* Micro top glass reflection highlight */}
        <div
          className="absolute top-0 inset-x-0 h-[1px] pointer-events-none"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)' }}
        />

        {/* Content overlay */}
        <div className="absolute inset-0 flex items-center justify-between px-4 sm:px-5">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--dk-surface-glass)] backdrop-blur-md shadow-xs">
              <span
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: tier.color }}
              >
                LVL
              </span>
              <span
                className="text-sm font-black tabular-nums leading-none"
                style={{ color: tier.color }}
              >
                {level}
              </span>
            </div>
            <span className="text-xs font-semibold text-foreground/80 hidden sm:inline">
              {levelTitle}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs tabular-nums">
              <span className="font-bold text-foreground">
                {effectiveXp.toLocaleString()}
              </span>
              <span className="text-muted-foreground/30">/</span>
              <span className="text-muted-foreground/60">
                {totalCeil.toLocaleString()}
              </span>
              <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider ml-0.5">
                XP
              </span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-[var(--dk-surface-glass)] text-foreground/80 shadow-xs">
              {Math.round(barProgress * 100)}%
            </span>
          </div>
        </div>
      </div>

      {/* XP Rank position */}
      {xpRank != null && (
        <div
          className="mt-1 text-right text-[10px] font-medium text-muted-foreground/60"
          style={{ animation: 'profileFadeIn 0.4s ease-out both', animationDelay: '350ms' }}
        >
          <span>#{xpRank.toLocaleString()}</span>
          {xpPercentile != null && (
            <span> · Top {xpPercentile}%</span>
          )}
        </div>
      )}
    </div>
  )
}
