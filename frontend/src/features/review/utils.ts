export const hubScoreColor = (score: number) => {
  if (score >= 80) return { text: 'text-emerald-400', bg: 'bg-emerald-400/10', ring: 'ring-emerald-400/30', glow: 'shadow-[0_0_24px_rgba(52,211,153,0.18)]' }
  if (score >= 60) return { text: 'text-sky-400', bg: 'bg-sky-400/10', ring: 'ring-sky-400/30', glow: 'shadow-[0_0_24px_rgba(56,189,248,0.18)]' }
  if (score >= 40) return { text: 'text-amber-400', bg: 'bg-amber-400/10', ring: 'ring-amber-400/30', glow: 'shadow-[0_0_24px_rgba(251,191,36,0.18)]' }
  return { text: 'text-red-400', bg: 'bg-red-400/10', ring: 'ring-red-400/30', glow: 'shadow-[0_0_24px_rgba(248,113,113,0.18)]' }
}

export const ratingsScoreColor = (score: number): { scoreClass: string; glowClass: string } => {
  if (score >= 80) return { scoreClass: 'dk-review-ratings__score--positive', glowClass: 'dk-review-ratings__glow--positive' }
  if (score >= 60) return { scoreClass: 'dk-review-ratings__score--medium', glowClass: 'dk-review-ratings__glow--medium' }
  if (score >= 40) return { scoreClass: 'dk-review-ratings__score--low', glowClass: 'dk-review-ratings__glow--low' }
  return { scoreClass: 'dk-review-ratings__score--critical', glowClass: 'dk-review-ratings__glow--critical' }
}

export const reviewScoreColor = (score: number): { text: string; glow: string } => {
  if (score >= 8) return { text: 'dk-review-section__score-value--emerald', glow: 'dk-review-section__glow--emerald' }
  if (score >= 6) return { text: 'dk-review-section__score-value--sky', glow: 'dk-review-section__glow--sky' }
  if (score >= 4) return { text: 'dk-review-section__score-value--amber', glow: 'dk-review-section__glow--amber' }
  return { text: 'dk-review-section__score-value--red', glow: 'dk-review-section__glow--red' }
}

export const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days < 1) return 'Today'
  if (days < 2) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 365) return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const formatRemaining = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export const isInCooldown = (cooldownUntil: string | null | undefined): boolean => {
  if (!cooldownUntil) return false
  return new Date(cooldownUntil).getTime() > Date.now()
}

export const isPastCooldown = (cooldownUntil: string | null | undefined): boolean => {
  if (!cooldownUntil) return true
  return new Date(cooldownUntil) <= new Date()
}
