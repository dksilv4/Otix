import { Badge } from '@ui/atoms/badge'
import type { SetData } from '../workout-queries'

interface ExerciseSetRowProps {
  name: string
  category: string | null
  sets: SetData[]
}

function formatWeight(kg: number | null): string {
  if (kg == null) return 'bodyweight'
  if (kg >= 20) return `${kg}kg`
  return `${(kg * 2.20462).toFixed(0)}lbs`
}

export function ExerciseSetRow({ name, category, sets }: ExerciseSetRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="text-sm font-semibold">{name}</span>
      {category && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {category.replace('_', ' ')}
        </Badge>
      )}
      <span className="text-xs text-muted-foreground/60">
        {sets.length} × {sets[0]?.reps ?? '?'}
        {sets[0]?.weightKg != null ? ` @ ${formatWeight(sets[0].weightKg)}` : ''}
      </span>
    </div>
  )
}
