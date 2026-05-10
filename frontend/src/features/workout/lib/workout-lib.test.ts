import { describe, expect, it, vi } from 'vitest'
import { matchAll, matchExercise } from './matcher'
import { parseWorkoutInput } from './parser'
import { formatVolume, groupWorkoutsByDay } from './workout-stats'
import type { WorkoutListOut } from '../workout-queries'

describe('parseWorkoutInput', () => {
  it('parses common set, rep, and metric weight formats', () => {
    const result = parseWorkoutInput('do 3x12 bench press at 80kg')

    expect(result.raw_tokens).toEqual(['do 3x12 bench press at 80kg'])
    expect(result.exercises).toEqual([
      {
        name: 'bench press',
        sets: [
          { reps: 12, weightKg: 80 },
          { reps: 12, weightKg: 80 },
          { reps: 12, weightKg: 80 },
        ],
      },
    ])
  })

  it('splits multiple segments and converts pounds to kilograms', () => {
    const result = parseWorkoutInput('bench 5x5 @ 185lbs, squat 3 sets of 10 100kg')

    expect(result.exercises).toHaveLength(2)
    expect(result.exercises[0]).toMatchObject({
      name: 'bench',
      sets: Array.from({ length: 5 }, () => ({ reps: 5, weightKg: 83.9 })),
    })
    expect(result.exercises[1]).toMatchObject({
      name: 'squat',
      sets: Array.from({ length: 3 }, () => ({ reps: 10, weightKg: 100 })),
    })
  })

  it('merges repeated exercises while preserving sets', () => {
    const result = parseWorkoutInput('bench 3x12 @ 60kg then bench 2x8 @ 70kg')

    expect(result.exercises).toHaveLength(1)
    expect(result.exercises[0].name).toBe('bench')
    expect(result.exercises[0].sets).toEqual([
      { reps: 12, weightKg: 60 },
      { reps: 12, weightKg: 60 },
      { reps: 12, weightKg: 60 },
      { reps: 8, weightKg: 70 },
      { reps: 8, weightKg: 70 },
    ])
  })

  it('keeps weight-only entries and ignores text without measurable work', () => {
    expect(parseWorkoutInput('bench press 100kg').exercises).toEqual([
      { name: 'bench press', sets: [{ reps: 0, weightKg: 100 }] },
    ])
    expect(parseWorkoutInput('felt strong today').exercises).toEqual([])
  })
})

describe('matchExercise', () => {
  it('matches aliases and returns alternatives', () => {
    const result = matchExercise('flat bench')

    expect(result.exercise?.name).toBe('Bench Press')
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.alternatives.length).toBeGreaterThan(0)
  })

  it('handles empty and unknown exercise names', () => {
    expect(matchExercise('   ')).toEqual({ exercise: null, confidence: 0, alternatives: [] })
    expect(matchExercise('notarealexercisename')).toEqual({ exercise: null, confidence: 0, alternatives: [] })
  })

  it('matches parsed names in order', () => {
    expect(matchAll(['bench', 'rdl']).map(({ result }) => result.exercise?.name)).toEqual([
      'Bench Press',
      'Romanian Deadlift',
    ])
  })
})

describe('groupWorkoutsByDay', () => {
  const workout = (
    id: string,
    startedAt: string,
    totalSets: number,
    exerciseCount: number,
    sets: Array<{ reps: number; weightKg: number | null }>,
  ): WorkoutListOut => ({
    id,
    userId: 'u1',
    rawInput: null,
    startedAt,
    completedAt: null,
    createdAt: startedAt,
    updatedAt: startedAt,
    notes: null,
    totalSets,
    exerciseCount,
    exercises: [
      {
        exerciseName: 'Bench Press',
        sets: sets.map((set) => ({
          reps: set.reps,
          weightKg: set.weightKg,
        })),
      },
    ],
  })

  it('groups workouts by local date, totals volume and sorts newest first', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-09T12:00:00Z'))

    const groups = groupWorkoutsByDay([
      workout('old', '2026-05-07T09:00:00Z', 1, 1, [{ reps: 5, weightKg: 20 }]),
      workout('today-a', '2026-05-09T09:00:00Z', 2, 1, [{ reps: 10, weightKg: 50 }]),
      workout('today-b', '2026-05-09T18:00:00Z', 3, 2, [{ reps: 5, weightKg: null }]),
    ])

    expect(groups.map((group) => group.date)).toEqual(['2026-05-09', '2026-05-07'])
    expect(groups[0]).toMatchObject({
      label: 'Today',
      totalVolumeKg: 500,
      totalSets: 5,
      exerciseCount: 3,
    })
    expect(groups[0].estimatedKcal).toBeGreaterThan(0)

    vi.useRealTimers()
  })

  it('formats volume compactly above one thousand kilograms', () => {
    expect(formatVolume(999)).toBe('999 kg')
    expect(formatVolume(1250)).toBe('1.3k kg')
  })
})
