export const XP_PER_LEVEL = 300

export interface LevelTier {
  color: string
  barColor: string
  glow: string
  hasShimmer: boolean
  hasGlow: boolean
}

export const LEVEL_TIERS: { min: number; tier: LevelTier }[] = [
  { min: 50, tier: { color: '#a78bfa', barColor: '#a78bfa33', glow: '#8b5cf633', hasShimmer: true, hasGlow: true } },
  { min: 35, tier: { color: '#22d3ee', barColor: '#22d3ee33', glow: '#06b6d433', hasShimmer: true, hasGlow: true } },
  { min: 20, tier: { color: '#34d399', barColor: '#34d39933', glow: '#10b98133', hasShimmer: false, hasGlow: true } },
  { min: 10, tier: { color: '#fbbf24', barColor: '#fbbf2433', glow: '#eab30833', hasShimmer: false, hasGlow: false } },
  { min: 5, tier: { color: '#94a3b8', barColor: '#94a3b833', glow: '#64748b33', hasShimmer: false, hasGlow: false } },
  { min: 1, tier: { color: '#d97706', barColor: '#d9770633', glow: '#b4530933', hasShimmer: false, hasGlow: false } },
]

export const LEVEL_TITLES: { min: number; max: number; title: string }[] = [
  { min: 100, max: 9999, title: 'Transcendent' },
  { min: 75, max: 99, title: 'Legend' },
  { min: 50, max: 74, title: 'Grandmaster' },
  { min: 35, max: 49, title: 'Master' },
  { min: 20, max: 34, title: 'Expert' },
  { min: 10, max: 19, title: 'Adept' },
  { min: 5, max: 9, title: 'Apprentice' },
  { min: 1, max: 4, title: 'Novice' },
]

export const GRADIENTS = [
  ['#0f0c29', '#302b63', '#24243e'],
  ['#1a1110', '#3b1c1a', '#5c1a2e'],
  ['#0a1a1a', '#1a3a3a', '#1a3a4a'],
  ['#141124', '#2d1b3a', '#1a2a4a'],
  ['#0d1b2a', '#1b2838', '#1a2a3a'],
  ['#1a1a2e', '#16213e', '#0f3460'],
] as const
