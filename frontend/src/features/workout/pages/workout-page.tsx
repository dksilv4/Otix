// TODO: Review this file
import { useMemo, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { Dumbbell, Flame, Weight } from 'lucide-react'
import { DkToastProvider, useToast } from '@/features/dk-ui/molecules/toast'
import { DkSpinner } from '@/features/dk-ui/atoms/spinner'
import { WorkoutInput } from '../atoms/workout-input'
import { ParsePreview } from '../molecules/parse-preview'
import { WorkoutCard } from '../molecules/workout-card'
import { parseWorkoutInput } from '../lib/parser'
import { matchExercise } from '../lib/matcher'
import { groupWorkoutsByDay, formatVolume } from '../lib/workout-stats'
import {
  useWorkouts,
  useCreateWorkout,
  useDeleteWorkout,
} from '../workout-queries'
import './workout-page.scss'

function WorkoutPageInner() {
  const { toast } = useToast()
  const [inputValue, setInputValue] = useState('')

  const workoutsQuery = useWorkouts()
  const createMutation = useCreateWorkout()
  const deleteMutation = useDeleteWorkout()

  // Live parse on every keystroke
  const parsedData = useMemo(() => {
    if (!inputValue.trim()) return null
    const parsed = parseWorkoutInput(inputValue)
    if (parsed.exercises.length === 0) return null

    return parsed.exercises.map((pe) => {
      const match = matchExercise(pe.name)
      return { parsed: pe, match }
    })
  }, [inputValue])

  const handleConfirm = () => {
    if (!parsedData || !inputValue.trim()) return

    const payloadExercises = parsedData.map((pd) => ({
      exerciseName: pd.match.exercise?.name ?? pd.parsed.name,
      sets: pd.parsed.sets,
    }))

    createMutation.mutate(
      {
        rawInput: inputValue.trim(),
        exercises: payloadExercises,
      },
      {
        onSuccess: () => {
          toast({ title: 'Workout logged', variant: 'success' })
          setInputValue('')
        },
        onError: () => {
          toast({ title: 'Failed to save workout', variant: 'error' })
        },
      },
    )
  }

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        toast({ title: 'Workout deleted', variant: 'success' })
      },
      onError: () => {
        toast({ title: 'Failed to delete', variant: 'error' })
      },
    })
  }

  const workouts = workoutsQuery.data?.pages.flatMap((p) => p.items) ?? []
  const dayGroups = useMemo(() => groupWorkoutsByDay(workouts), [workouts])
  const isEmpty = !workoutsQuery.isLoading && workouts.length === 0

  return (
    <div className="dk-workout-page">
      <div>
        <h1 className="dk-workout-page__title">Workout</h1>
        <p className="dk-workout-page__subtitle">
          Log your training with natural language
        </p>
      </div>

      <div className="dk-workout-page__input-area">
        <WorkoutInput
          value={inputValue}
          onChange={setInputValue}
          isLoading={createMutation.isPending}
        />

        {parsedData && (
          <ParsePreview
            matched={parsedData}
            onConfirm={handleConfirm}
            isSubmitting={createMutation.isPending}
          />
        )}
      </div>

      <div className="dk-workout-page__history">
        <h2 className="dk-workout-page__history-heading">
          History
        </h2>

        {workoutsQuery.isLoading && (
          <div className="dk-workout-page__loading">
            <DkSpinner className="dk-workout-page__spinner" />
          </div>
        )}

        {isEmpty && (
          <div className="dk-workout-page__empty">
            <Dumbbell className="dk-workout-page__empty-icon" />
            <p className="dk-workout-page__empty-text">
              Log your first workout
            </p>
          </div>
        )}

        {dayGroups.map((group) => (
          <div key={group.date} className="dk-workout-page__day-group">
            {/* Day header with stats */}
            <div className="dk-workout-page__day-header">
              <span className="dk-workout-page__day-label">{group.label}</span>
              <div className="dk-workout-page__day-stats">
                {group.estimatedKcal > 0 && (
                  <span className="dk-workout-page__stat-item">
                    <Flame className="dk-workout-page__stat-icon" />
                    ~{group.estimatedKcal.toLocaleString()} kcal
                  </span>
                )}
                {group.totalVolumeKg > 0 && (
                  <span className="dk-workout-page__stat-item">
                    <Weight className="dk-workout-page__stat-icon" />
                    {formatVolume(group.totalVolumeKg)}
                  </span>
                )}
              </div>
            </div>

            {group.workouts.map((w) => (
              <WorkoutCard
                key={w.id}
                workout={w}
                onDelete={handleDelete}
                isDeleting={deleteMutation.isPending}
              />
            ))}
          </div>
        ))}

        {workoutsQuery.hasNextPage && (
          <div className="dk-workout-page__load-more">
            <button
              className="dk-workout-page__load-more-btn"
              onClick={() => workoutsQuery.fetchNextPage()}
              disabled={workoutsQuery.isFetchingNextPage}
            >
              {workoutsQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function WorkoutPage() {
  return (
    <DkToastProvider>
      <Helmet>
        <title>Workout - Otix</title>
        <meta name="description" content="Log your workouts with natural language and track your training history on Otix." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <WorkoutPageInner />
    </DkToastProvider>
  )
}
