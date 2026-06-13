// TODO: Review this file
export const workoutKeys = {
  all: () => ['workouts'] as const,
  list: () => [...workoutKeys.all(), 'list'] as const,
  today: () => [...workoutKeys.all(), 'today'] as const,
  heatmap: (weeks?: number) => [...workoutKeys.all(), 'heatmap', weeks ?? 12] as const,
  detail: (id: string) => [...workoutKeys.all(), 'detail', id] as const,
  exercises: () => ['exercises'] as const,
  categories: () => ['exercises', 'categories'] as const,
}
