export function calculatePasswordStrength(password: string): number {
  let score = 0
  if (password.length >= 8) score += 25
  if (password.length >= 12) score += 15
  if (password.length >= 16) score += 10
  if (/[a-z]/.test(password)) score += 10
  if (/[A-Z]/.test(password)) score += 15
  if (/[0-9]/.test(password)) score += 15
  if (/[^a-zA-Z0-9]/.test(password)) score += 10
  return Math.min(score, 100)
}

export type StrengthTier = 'weak' | 'fair' | 'good' | 'strong'

export function getStrengthTier(score: number): StrengthTier {
  if (score < 30) return 'weak'
  if (score < 60) return 'fair'
  if (score < 80) return 'good'
  return 'strong'
}

export function getTierLabel(tier: StrengthTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}
