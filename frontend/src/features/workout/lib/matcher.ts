import Fuse from 'fuse.js'
import { EXERCISE_CATALOG, type ExerciseEntry } from './exercises'

export interface MatchResult {
  exercise: ExerciseEntry | null
  confidence: number
  alternatives: ExerciseEntry[]
}

let _fuse: Fuse<ExerciseEntry> | null = null

function getFuse(): Fuse<ExerciseEntry> {
  if (!_fuse) {
    _fuse = new Fuse(EXERCISE_CATALOG, {
      keys: [
        { name: 'name', weight: 0.7 },
        { name: 'aliases', weight: 0.3 },
      ],
      threshold: 0.4,
      distance: 100,
    })
  }
  return _fuse
}

/**
 * Fuzzy match an exercise name against the catalog.
 * Returns the best match, confidence score, and top alternatives.
 */
export function matchExercise(name: string): MatchResult {
  const clean = name.toLowerCase().trim()
  if (!clean) return { exercise: null, confidence: 0, alternatives: [] }

  const fuse = getFuse()
  const results = fuse.search(clean, { limit: 5 })

  if (results.length === 0) {
    return { exercise: null, confidence: 0, alternatives: [] }
  }

  const best = results[0]
  // Fuse score is 0 (perfect) to 1 (worst). Invert for confidence.
  // threshold is 0.4, so score <= 0.4 means match, higher means no match.
  const confidence = best.score !== undefined ? Math.max(0, 1 - best.score! / 0.4) : 0

  return {
    exercise: best.item,
    confidence: Math.min(1, confidence),
    alternatives: results.slice(1).map((r) => r.item),
  }
}

/**
 * Match all exercises from a parse result against the catalog.
 */
export function matchAll(
  parsedNames: string[],
): { name: string; result: MatchResult }[] {
  return parsedNames.map((name) => ({
    name,
    result: matchExercise(name),
  }))
}
