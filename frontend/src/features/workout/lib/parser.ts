export interface ParsedSet {
  reps: number
  weightKg: number | null
}

export interface ParsedExercise {
  name: string
  sets: ParsedSet[]
}

export interface ParseResult {
  exercises: ParsedExercise[]
  raw_tokens: string[]
}

const LB_TO_KG = 0.453592

const SETS_X_REPS_RX = /(\d+)\s*[x×*]\s*(\d+)/gi
const SETS_OF_RX = /(\d+)\s*sets?\s*of\s*(\d+)/gi
const SETS_REPS_RX = /(\d+)\s*sets?\s*(?:of\s*)?(\d+)\s*reps?/gi
const REPS_RX = /(\d+)\s*rep(?:s|etitions?)?(?:\(s\))?/gi
const WEIGHT_RX = /(\d+(?:\.\d+)?)\s*(kg|lbs?|#)\b/gi
const WEIGHT_AT_RX = /(?:@|at)\s*(\d+(?:\.\d+)?)\s*(kg|lbs?|#)?/gi

const FILLER_RX = /\b(?:do|did|for|of|with|and|then|the|a|an|some|just|about|around)\b/gi

function extractWeight(str: string): { weightKg: number | null; cleaned: string } {
  let weightKg: number | null = null
  let cleaned = str

  // Try "@80kg" or "at 80kg"
  cleaned = cleaned.replace(WEIGHT_AT_RX, (_m, num, unit) => {
    const w = parseFloat(num)
    weightKg = (unit || 'kg').toLowerCase() === 'kg' ? w : Math.round(w * LB_TO_KG * 10) / 10
    return ''
  })

  // Try "20kg" or "185lbs"
  if (weightKg == null) {
    cleaned = cleaned.replace(WEIGHT_RX, (_m, num, unit) => {
      const w = parseFloat(num)
      weightKg = unit.toLowerCase() === 'kg' ? w : Math.round(w * LB_TO_KG * 10) / 10
      return ''
    })
  }

  return { weightKg, cleaned: cleaned.replace(/\s+/g, ' ').trim() }
}

function parseSegment(segment: string): ParsedExercise | null {
  let s = segment.trim()
  if (!s) return null

  let sets = 0
  let reps = 0

  // 1. "{N} sets of {M}" or "{N} sets {M} reps" — explicit sets+reps phrase
  const setsRepsPhrase = SETS_REPS_RX.exec(s) || SETS_OF_RX.exec(s)
  if (setsRepsPhrase) {
    sets = parseInt(setsRepsPhrase[1], 10)
    reps = parseInt(setsRepsPhrase[2], 10)
    s = s.replace(setsRepsPhrase[0], '')
  }

  // Reset lastIndex since we used .exec
  SETS_REPS_RX.lastIndex = 0
  SETS_OF_RX.lastIndex = 0

  // 2. "{N}x{M}" pattern — classic 3x12
  const srMatch = SETS_X_REPS_RX.exec(s)
  if (srMatch) {
    if (sets === 0) sets = parseInt(srMatch[1], 10)
    if (reps === 0) reps = parseInt(srMatch[2], 10)
    s = s.replace(srMatch[0], '')
  }
  SETS_X_REPS_RX.lastIndex = 0

  // 3. "{N} rep(s)" pattern — "10 rep" or "10 reps"
  // Only match if we haven't already found reps from a sets×reps pattern
  const repPhrase = REPS_RX.exec(s)
  if (repPhrase) {
    if (reps === 0) reps = parseInt(repPhrase[1], 10)
    s = s.replace(repPhrase[0], '')
  }
  REPS_RX.lastIndex = 0

  // 4. Extract weight
  const { weightKg, cleaned: afterWeight } = extractWeight(s)
  s = afterWeight

  // 5. Default: if we have reps but no sets, it's 1 set
  if (reps > 0 && sets === 0) sets = 1

  // Must have at least sets+reps or a weight to be a valid exercise entry
  if (sets === 0 && reps === 0 && weightKg == null) return null

  // 6. What's left is the exercise name — clean it up
  let name = s
    .replace(FILLER_RX, '')
    .replace(/[()]/g, '')    // remove parens
    .replace(/\s+/g, ' ')
    .trim()

  // If nothing left, try using the original segment minus the matched patterns
  if (!name) {
    name = segment
      .replace(/@\s*\d+(?:\.\d+)?\s*(?:kg|lbs?|#)?/gi, '')
      .replace(/\d+\s*(?:kg|lbs?|#)\b/gi, '')
      .replace(/\d+\s*[x×*]\s*\d+/gi, '')
      .replace(/\d+\s*rep(?:s|etitions?)?(?:\(s\))?/gi, '')
      .replace(/\d+\s*sets?\s*(?:of\s*)?\d+\s*reps?/gi, '')
      .replace(/\d+\s*sets?\s*of\s*\d+/gi, '')
      .replace(FILLER_RX, '')
      .replace(/[()]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  if (!name) return null

  const setList: ParsedSet[] = Array.from(
    { length: sets || 1 },
    () => ({ reps: reps || 0, weightKg }),
  )

  return { name: name.toLowerCase(), sets: setList }
}

/**
 * Parse a natural language workout input string.
 *
 * Handles:
 * - "3x12 bench press at 80kg"          → 3 sets of 12, 80kg
 * - "10 rep bench press 20kg"           → 1 set of 10, 20kg
 * - "10 reps bench press 20kg"          → 1 set of 10, 20kg
 * - "bench press 10 reps 20kg"          → 1 set of 10, 20kg
 * - "3 sets of 10 bench press 20kg"     → 3 sets of 10, 20kg
 * - "bench 5x5 @ 185lbs"               → 5 sets of 5, ~83.9kg
 * - "bench 5x5"                         → 5 sets of 5, no weight
 * - "bench press 100kg"                 → 1 set, weight only
 * - "3x12 bench, 5x5 squat 100kg"       → two exercises
 * - "do 3x12 bench press"               → filler "do" stripped
 * - Newlines, semicolons, "then", "+" as separators
 */
export function parseWorkoutInput(raw: string): ParseResult {
  if (!raw.trim()) return { exercises: [], raw_tokens: [] }

  const segments = raw
    .split(/[,;+]|\bthen\b|\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const raw_tokens: string[] = []
  const exercises: ParsedExercise[] = []

  for (const segment of segments) {
    raw_tokens.push(segment)
    const result = parseSegment(segment)
    if (result) {
      exercises.push(result)
    }
  }

  // Merge same-name exercises from different segments (e.g. "3x12 bench, 3x10 bench")
  const merged = mergeExercises(exercises)

  return { exercises: merged, raw_tokens }
}

function mergeExercises(exercises: ParsedExercise[]): ParsedExercise[] {
  const seen = new Map<string, ParsedExercise>()

  for (const ex of exercises) {
    const existing = seen.get(ex.name)
    if (existing) {
      existing.sets.push(...ex.sets)
    } else {
      seen.set(ex.name, { ...ex, sets: [...ex.sets] })
    }
  }

  return [...seen.values()]
}
