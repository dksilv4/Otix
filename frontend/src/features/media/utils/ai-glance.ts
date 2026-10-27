export const formatMediaRuntime = (runtimeMinutes?: number | null): string | null => {
  if (!runtimeMinutes || runtimeMinutes <= 0) return null
  const hours = Math.floor(runtimeMinutes / 60)
  const mins = runtimeMinutes % 60
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`
  if (hours > 0) return `${hours}h`
  return `${mins}m`
}

export const getCertification = (
  releases?: Array<{ countryCode?: string; certification: string | null }>,
): string | null => {
  if (!releases || releases.length === 0) return null
  const usRelease = releases.find((r) => r.countryCode === 'US' && r.certification)
  if (usRelease?.certification) return usRelease.certification
  const anyCert = releases.find((r) => r.certification)
  return anyCert?.certification ?? null
}

export const generateAiHighlights = (
  genres: Array<{ name: string }>,
  _description?: string | null,
): string[] => {
  const highlights: string[] = []
  const genreNames = genres.map((g) => g.name.toLowerCase())

  if (genreNames.some((g) => g.includes('sci-fi') || g.includes('science fiction'))) {
    highlights.push('Mind-Bending Concept')
  }
  if (genreNames.some((g) => g.includes('action') || g.includes('adventure'))) {
    highlights.push('High-Octane Pacing')
  }
  if (genreNames.some((g) => g.includes('drama'))) {
    highlights.push('Emotionally Gripping')
  }
  if (genreNames.some((g) => g.includes('thriller') || g.includes('mystery'))) {
    highlights.push('Edge-of-Your-Seat Tension')
  }
  if (genreNames.some((g) => g.includes('comedy'))) {
    highlights.push('Witty & Hilarious')
  }
  if (genreNames.some((g) => g.includes('animation'))) {
    highlights.push('Visually Stunning')
  }
  if (genreNames.some((g) => g.includes('romance'))) {
    highlights.push('Heartfelt Connection')
  }

  if (highlights.length === 0) {
    highlights.push('Critically Acclaimed', 'Compelling Narrative')
  }

  return highlights.slice(0, 3)
}
