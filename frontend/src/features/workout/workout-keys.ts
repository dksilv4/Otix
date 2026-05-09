export const workoutKeys = {
  all: () => ['workouts'] as const,
  list: () => [...workoutKeys.all(), 'list'] as const,
  detail: (id: string) => [...workoutKeys.all(), 'detail', id] as const,
  exercises: () => ['exercises'] as const,
  categories: () => ['exercises', 'categories'] as const,
}
