import { useMemo } from 'react'
import {
 MessageSquare,
 Play,
 List,
 Dumbbell,
 Zap,
 Feather,
 UserPlus,
 Users,
 Flame,
 Award,
 Compass,
 Layers,
 ThumbsUp,
 Lock,
} from 'lucide-react'

// Define the Icon mapping to resolve string names from backend
const ICON_MAP: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
 MessageSquare,
 Play,
 List,
 Dumbbell,
 Zap,
 Feather,
 UserPlus,
 Users,
 Flame,
 Award,
 Compass,
 Layers,
 ThumbsUp,
}

export interface BadgeRendererProps {
 badgeKey: string
 label: string
 description: string
 icon: string
 tier: 'bronze' | 'silver' | 'gold' | 'platinum' | 'special'
 earned: boolean
 earnedAt?: string | null
 size?: 'sm' | 'md' | 'lg'
}

const TIER_COLORS = {
 bronze: {
 primary: '#cd7f32',
 accent: '#ff9c47',
 gradient: ['#cd7f32', '#8c4f1a', '#4a250a'],
 glow: 'rgba(205, 127, 50, 0.2)',
 },
 silver: {
 primary: '#a8b2c1',
 accent: '#cbd5e1',
 gradient: ['#cbd5e1', '#94a3b8', '#475569'],
 glow: 'rgba(168, 178, 193, 0.2)',
 },
 gold: {
 primary: '#f0b90b',
 accent: '#fcd34d',
 gradient: ['#fbbf24', '#f59e0b', '#b45309'],
 glow: 'rgba(240, 185, 11, 0.3)',
 },
 platinum: {
 primary: '#55c0e0',
 accent: '#a5f3fc',
 gradient: ['#67e8f9', '#06b6d4', '#4f46e5'],
 glow: 'rgba(85, 192, 224, 0.4)',
 },
 special: {
 primary: '#e8326e',
 accent: '#fda4af',
 gradient: ['#ec4899', '#d946ef', '#7c3aed'],
 glow: 'rgba(232, 50, 110, 0.5)',
 },
}

export function BadgeRenderer({
 badgeKey,
 icon,
 tier,
 earned,
 size = 'md',
}: Omit<BadgeRendererProps, 'label' | 'description' | 'earnedAt'>) {
 const IconComponent = ICON_MAP[icon] ?? Award
 const colors = TIER_COLORS[tier] ?? TIER_COLORS.bronze

 const sizeClasses = {
 sm: 'w-12 h-12',
 md: 'w-20 h-20',
 lg: 'w-28 h-28',
 }[size]

 const iconSizes = {
 sm: 'h-5 w-5',
 md: 'h-7 w-7',
 lg: 'h-10 w-10',
 }[size]

 // Cumulative design checks
 const isSilverOrAbove = ['silver', 'gold', 'platinum', 'special'].includes(tier)
 const isGoldOrAbove = ['gold', 'platinum', 'special'].includes(tier)
 const isPlatinumOrAbove = ['platinum', 'special'].includes(tier)
 const isSpecial = tier === 'special'

 // Render SVG with cumulative shape details
 const shapeSvg = useMemo(() => {
 const id = `grad-${badgeKey}`

 return (
 <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]">
 <defs>
 <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
 <stop offset="0%" stopColor={colors.gradient[0]} />
 <stop offset="50%" stopColor={colors.gradient[1]} />
 <stop offset="100%" stopColor={colors.gradient[2]} />
 </linearGradient>
 </defs>

 {/* 1. Base Crest Shield (rendered for all tiers) */}
 <path
 d="M 50,14 C 72,14 85,20 85,34 C 85,58 70,80 50,90 C 30,80 15,58 15,34 C 15,20 28,14 50,14 Z"
 fill="rgba(24, 24, 27, 0.45)"
 stroke={`url(#${id})`}
 strokeWidth="3.5"
 className="transition-all duration-300"
 />

 {/* 2. Silver Bracket Trims (Silver, Gold, Platinum, Special) */}
 {isSilverOrAbove && (
 <>
 {/* Left Bracket */}
 <path
 d="M 10,30 C 7,42 7,58 10,70 C 13,62 13,38 10,30 Z"
 fill={`url(#${id})`}
 className="opacity-90"
 />
 {/* Right Bracket */}
 <path
 d="M 90,30 C 93,42 93,58 90,70 C 87,62 87,38 90,30 Z"
 fill={`url(#${id})`}
 className="opacity-90"
 />
 </>
 )}

 {/* 3. Gold Crown Crest (Gold, Platinum, Special) */}
 {isGoldOrAbove && (
 <path
 d="M 36,13 L 40,4 L 45,9 L 50,2 L 55,9 L 60,4 L 64,13 Z"
 fill={`url(#${id})`}
 className="opacity-95"
 />
 )}

 {/* 4. Platinum Orbital Ring (Platinum, Special) */}
 {isPlatinumOrAbove && (
 <ellipse
 cx="50"
 cy="52"
 rx="45"
 ry="11"
 transform="rotate(-15 50 52)"
 fill="none"
 stroke={`url(#${id})`}
 strokeWidth="2.5"
 strokeDasharray="160 40"
 className="opacity-80"
 />
 )}

 {/* 5. Special Starburst Corners (Special only) */}
 {isSpecial && (
 <>
 {/* Top-Left Star */}
 <path
 d="M 12 12 C 12 15 13 16 16 16 C 13 16 12 17 12 20 C 12 17 11 16 8 16 C 11 16 12 15 12 12 Z"
 fill={colors.accent}
 />
 {/* Top-Right Star */}
 <path
 d="M 88 12 C 88 15 89 16 92 16 C 89 16 88 17 88 20 C 88 17 87 16 84 16 C 87 16 88 15 88 12 Z"
 fill={colors.accent}
 />
 {/* Bottom-Left Star */}
 <path
 d="M 12 80 C 12 83 13 84 16 84 C 13 84 12 85 12 88 C 12 85 11 84 8 84 C 11 84 12 83 12 80 Z"
 fill={colors.accent}
 />
 {/* Bottom-Right Star */}
 <path
 d="M 88 80 C 88 83 89 84 92 84 C 89 84 88 85 88 88 C 88 85 87 84 84 84 C 87 84 88 83 88 80 Z"
 fill={colors.accent}
 />
 </>
 )}
 </svg>
 )
 }, [tier, colors, badgeKey, isSilverOrAbove, isGoldOrAbove, isPlatinumOrAbove, isSpecial])

 return (
 <div
 className={`relative flex items-center justify-center select-none group transition-all duration-300 ${sizeClasses}`}
 style={{
 filter: earned ? 'none' : 'grayscale(0.9) contrast(0.85) brightness(0.55)',
 opacity: earned ? 1 : 0.35,
 }}
 >
 {/* Outer ambient glow on hover (if earned) */}
 {earned && (
 <div
 className="absolute inset-0 rounded-full scale-95 opacity-0 group-hover:opacity-100 group-hover:scale-105 blur-xl transition-all duration-500 pointer-events-none"
 style={{
 backgroundColor: colors.glow,
 boxShadow: `0 0 40px ${colors.glow}`,
 }}
 />
 )}

 {/* SVG Container */}
 <div className="absolute inset-0 w-full h-full flex items-center justify-center transition-transform duration-300 group-hover:scale-105">
 {shapeSvg}
 </div>

 {/* Inner Icon & Title overlay */}
 <div className="relative z-10 flex flex-col items-center justify-center transition-all duration-300 group-hover:scale-110">
 <IconComponent
 className={iconSizes}
 style={{
 color: earned ? colors.accent : 'rgba(255,255,255,0.22)',
 filter: earned ? `drop-shadow(0 0 6px ${colors.primary}66)` : 'none',
 }}
 />
 </div>

 {/* Rarity sparkles (Platinum & Special only, on hover) */}
 {earned && (tier === 'platinum' || tier === 'special') && (
 <div className="absolute inset-0 pointer-events-none overflow-hidden scale-95 group-hover:scale-110 transition-transform duration-300">
 <div
 className="absolute top-1/4 left-1/4 w-1.5 h-1.5 rounded-full bg-white opacity-0 group-hover:opacity-100 animate-ping"
 style={{ animationDuration: '1.2s' }}
 />
 <div
 className="absolute bottom-1/4 right-1/4 w-1 h-1 rounded-full bg-white opacity-0 group-hover:opacity-100 animate-ping"
 style={{ animationDuration: '0.8s', animationDelay: '0.3s' }}
 />
 </div>
 )}

 {/* Shimmer flare effect (Platinum & Special only) */}
 {earned && (tier === 'platinum' || tier === 'special') && (
 <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none scale-[0.8]">
 <div
 className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent -skew-x-12 translate-x-[-150%]"
 style={{
 animation: 'xpShimmer 3s ease-in-out infinite',
 }}
 />
 </div>
 )}

 {/* Locked Lock Icon Badge */}
 {!earned && (
 <div className="absolute bottom-0 right-0 p-1 bg-neutral-950/80 rounded-full shadow-md z-20">
 <Lock className="h-3 w-3 text-muted-foreground/60" />
 </div>
 )}
 </div>
 )
}
