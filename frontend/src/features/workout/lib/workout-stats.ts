// TODO: Review this file
import type { WorkoutListOut } from '../workout-queries'

export interface DayGroup {
  date: string
  label: string
  workouts: WorkoutListOut[]
  totalVolumeKg: number
  estimatedKcal: number
  totalSets: number
  exerciseCount: number
}

const GRAVITY = 9.81
const AVG_BAR_PATH_M = 0.5
const MUSCLE_EFFICIENCY = 0.25
const JOULES_PER_KCAL = 4184
const METABOLIC_ADJUSTMENT = 1.8

/**
 * Group workouts by local calendar date.
 */
export function groupWorkoutsByDay(workouts: WorkoutListOut[]): DayGroup[] {
  const map = new Map<string, WorkoutListOut[]>()

  for (const w of workouts) {
    const d = new Date(w.startedAt)
    const key = d.toLocaleDateString('en-CA') // ISO-like: "2026-05-09"
    const list = map.get(key)
    if (list) {
      list.push(w)
    } else {
      map.set(key, [w])
    }
  }

  const groups: DayGroup[] = []
  for (const [date, dayWorkouts] of map) {
    const d = new Date(date + 'T00:00:00')
    let totalVolumeKg = 0
    let totalSets = 0
    let exerciseCount = 0

    for (const w of dayWorkouts) {
      totalSets += w.totalSets
      exerciseCount += w.exerciseCount
      for (const ex of w.exercises) {
        for (const set of ex.sets) {
          if (set.weightKg != null) {
            totalVolumeKg += set.reps * set.weightKg
          }
        }
      }
    }

    // Estimated calories based on mechanical work:
    //   work (J) = mass (kg) × gravity (m/s²) × distance (m)
    //   metabolic energy (J) = work / muscle efficiency
    //   kcal = metabolic energy / 4184
    //   × adjustment factor for EPOC + stabilizer muscles
    const mechanicalKcal = (totalVolumeKg * GRAVITY * AVG_BAR_PATH_M) / (MUSCLE_EFFICIENCY * JOULES_PER_KCAL)
    const estimatedKcal = Math.round(mechanicalKcal * METABOLIC_ADJUSTMENT)

    const today = new Date()
    const diffDays = Math.floor((today.getTime() - d.getTime()) / 86400000)

    let label: string
    if (diffDays === 0) {
      label = 'Today'
    } else if (diffDays === 1) {
      label = 'Yesterday'
    } else {
      label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }

    groups.push({
      date,
      label,
      workouts: dayWorkouts,
      totalVolumeKg: Math.round(totalVolumeKg),
      estimatedKcal,
      totalSets,
      exerciseCount,
    })
  }

  groups.sort((a, b) => b.date.localeCompare(a.date))
  return groups
}

export function formatVolume(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(1)}k kg`
  }
  return `${kg.toLocaleString()} kg`
}
