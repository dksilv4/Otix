// TODO: Review this file
import {
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

export const workoutKeys = {
  all: () => ['workouts'] as const,
  list: () => [...workoutKeys.all(), 'list'] as const,
  today: () => [...workoutKeys.all(), 'today'] as const,
  heatmap: (weeks?: number) => [...workoutKeys.all(), 'heatmap', weeks ?? 12] as const,
  detail: (id: string) => [...workoutKeys.all(), 'detail', id] as const,
  exercises: () => ['exercises'] as const,
  categories: () => ['exercises', 'categories'] as const,
}

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

export function useWorkouts(opts?: { enabled?: boolean }) {
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
    enabled: opts?.enabled,
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

export interface WorkoutTodayResponse {
  checkedIn: boolean
  workout: WorkoutListOut | null
  currentStreak: number
  longestStreak: number
}

export function useTodayWorkout(opts?: { enabled?: boolean }) {
  return useQuery({
    ...queryOptions({
      queryKey: workoutKeys.today(),
      queryFn: async () => {
        const { data } = await apiClient.get<WorkoutTodayResponse>('/workout/today')
        return data
      },
      staleTime: 1000 * 60 * 2,
    }),
    enabled: opts?.enabled,
  })
}

export function useCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<WorkoutTodayResponse>('/workout/today')
      return data
    },
    onSuccess: (data) => {
      qc.setQueryData(workoutKeys.today(), data)
      qc.invalidateQueries({ queryKey: workoutKeys.list() })
      qc.invalidateQueries({ queryKey: ['workouts', 'heatmap'] })
    },
  })
}

export function useUndoCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await apiClient.delete('/workout/today')
    },
    onSuccess: () => {
      qc.setQueryData(workoutKeys.today(), {
        checkedIn: false,
        workout: null,
        currentStreak: 0,
        longestStreak: 0,
      })
      qc.invalidateQueries({ queryKey: workoutKeys.today() })
      qc.invalidateQueries({ queryKey: workoutKeys.list() })
      qc.invalidateQueries({ queryKey: ['workouts', 'heatmap'] })
    },
  })
}

export interface HeatmapDateEntry {
  date: string
  count: number
  volumeKg: number | null
}

export interface WorkoutHeatmapResponse {
  weeks: number
  dates: HeatmapDateEntry[]
}

export function useHeatmap(weeks = 12) {
  return useQuery(
    queryOptions({
      queryKey: workoutKeys.heatmap(weeks),
      queryFn: async () => {
        const { data } = await apiClient.get<WorkoutHeatmapResponse>('/workout/heatmap', {
          params: { weeks },
        })
        return data
      },
      staleTime: 1000 * 60 * 5,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnMount: true,
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
