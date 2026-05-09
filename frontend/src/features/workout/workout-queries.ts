import {
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { workoutKeys } from './workout-keys'

export interface SetData {
  reps: number
  weightKg: number | null
}

export interface ExerciseOut {
  id: string
  name: string
  category: string | null
  aliases: string[]
}

export interface WorkoutExerciseOut {
  exerciseId: string
  exercise: ExerciseOut
  sortOrder: number
  sets: SetData[]
}

export interface WorkoutOut {
  id: string
  userId: string
  rawInput: string | null
  notes: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
  exercises: WorkoutExerciseOut[]
}

export interface WorkoutExerciseSummary {
  exerciseName: string
  sets: SetData[]
}

export interface WorkoutListOut {
  id: string
  userId: string
  rawInput: string | null
  notes: string | null
  startedAt: string
  completedAt: string | null
  createdAt: string
  updatedAt: string
  exerciseCount: number
  totalSets: number
  exercises: WorkoutExerciseSummary[]
}

export interface PaginatedWorkouts {
  items: WorkoutListOut[]
  nextCursor: string | null
  hasMore: boolean
}

export interface WorkoutCreatePayload {
  rawInput: string
  exercises: {
    exerciseName: string
    sets: { reps: number; weightKg: number | null }[]
  }[]
  notes?: string | null
  startedAt?: string | null
}

export function useWorkouts() {
  return useInfiniteQuery({
    queryKey: workoutKeys.list(),
    queryFn: async ({ pageParam }) => {
      const params: Record<string, string> = { limit: '20' }
      if (pageParam) params.cursor = pageParam
      const { data } = await apiClient.get<PaginatedWorkouts>('/workout', { params })
      return data
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    staleTime: 1000 * 60,
  })
}

export function useWorkout(id: string) {
  return useQuery(
    queryOptions({
      queryKey: workoutKeys.detail(id),
      queryFn: async () => {
        const { data } = await apiClient.get<WorkoutOut>(`/workout/${id}`)
        return data
      },
      staleTime: 1000 * 60,
    }),
  )
}

export function useCreateWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: WorkoutCreatePayload) => {
      const { data } = await apiClient.post<WorkoutOut>('/workout', payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workoutKeys.list() })
    },
  })
}

export function useDeleteWorkout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/workout/${id}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workoutKeys.list() })
    },
  })
}

export function useExercises() {
  return useQuery(
    queryOptions({
      queryKey: workoutKeys.exercises(),
      queryFn: async () => {
        const { data } = await apiClient.get<ExerciseOut[]>('/exercises')
        return data
      },
      staleTime: Infinity,
    }),
  )
}

export function useCategories() {
  return useQuery(
    queryOptions({
      queryKey: workoutKeys.categories(),
      queryFn: async () => {
        const { data } = await apiClient.get<{ category: string; count: number }[]>(
          '/exercises/categories',
        )
        return data
      },
      staleTime: Infinity,
    }),
  )
}
