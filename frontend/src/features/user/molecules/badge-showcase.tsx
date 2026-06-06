// TODO: Review this file
import './badge-showcase.scss'
import {
  MessageSquare,
  Play,
  List,
  Dumbbell,
  Zap,
  Feather,
  UserPlus,
  Flame,
  Award,
  Compass,
  Layers,
  ThumbsUp,
} from 'lucide-react'

export interface BadgeDef {
  badge_key: string
  label: string
  description: string
  icon: string
  tier: string
  earned: boolean
  earned_at: string | null
}

const TIER_COLORS: Record<string, string> = {
  bronze: '#cd7f32',
  silver: '#a8b2c1',
  gold: '#f0b90b',
  platinum: '#55c0e0',
  special: '#e8326e',
}

const ICON_MAP: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  MessageSquare,
  Play,
  List,
  Dumbbell,
  Zap,
  Feather,
  UserPlus,
  Flame,
  Award,
  Compass,
  Layers,
  ThumbsUp,
}

function BadgeIcon({ icon, className, style }: { icon: string; className?: string; style?: React.CSSProperties }) {
  const Icon = ICON_MAP[icon]
  if (!Icon) return <Award className={className} style={style} />
  return <Icon className={className} style={style} />
}

interface BadgeShowcaseProps {
  badges: BadgeDef[]
}

export function BadgeShowcase({ badges }: BadgeShowcaseProps) {
  return (
    <div className="dk-user-badge-showcase__grid">
      {badges.map((badge) => {
        const color = TIER_COLORS[badge.tier] ?? '#6b7280'
        return (
          <div
            key={badge.badge_key}
            className="dk-user-badge-showcase__card"
            title={`${badge.label}${badge.earned ? '' : ' — Locked'}\n${badge.description}`}
          >
            <div
              className="dk-user-badge-showcase__icon-wrapper"
              style={{
                border: `2px solid ${badge.earned ? color : 'rgba(255,255,255,0.08)'}`,
                backgroundColor: badge.earned ? `${color}10` : 'transparent',
              }}
            >
              <BadgeIcon
                icon={badge.icon}
                className="h-6 w-6"
                style={{
                  color: badge.earned ? color : 'rgba(255,255,255,0.12)',
                }}
              />
              {badge.earned && (
                <div
                  className="dk-user-badge-showcase__earned-dot"
                  style={{ backgroundColor: color }}
                />
              )}
            </div>
            <span
              className="dk-user-badge-showcase__label"
              style={{ color: badge.earned ? 'var(--foreground)' : 'rgba(255,255,255,0.2)' }}
            >
              {badge.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
