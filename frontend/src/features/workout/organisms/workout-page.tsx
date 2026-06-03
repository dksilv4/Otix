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
    <div className="mx-auto lg:max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Workout</h1>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Log your training with natural language
        </p>
      </div>

      <div className="space-y-3">
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

      <div className="space-y-6">
        <h2 className="text-sm font-semibold text-muted-foreground/60 uppercase tracking-wider">
          History
        </h2>

        {workoutsQuery.isLoading && (
          <div className="flex justify-center py-12">
            <DkSpinner className="h-6 w-6" />
          </div>
        )}

        {isEmpty && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
            <Dumbbell className="h-10 w-10 text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground/50">
              Log your first workout
            </p>
          </div>
        )}

        {dayGroups.map((group) => (
          <div key={group.date} className="space-y-2">
            {/* Day header with stats */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{group.label}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground/50">
                {group.estimatedKcal > 0 && (
                  <span className="flex items-center gap-1">
                    <Flame className="h-3 w-3" />
                    ~{group.estimatedKcal.toLocaleString()} kcal
                  </span>
                )}
                {group.totalVolumeKg > 0 && (
                  <span className="flex items-center gap-1">
                    <Weight className="h-3 w-3" />
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
          <div className="flex justify-center pt-2">
            <button
              className="text-sm text-primary hover:underline"
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
