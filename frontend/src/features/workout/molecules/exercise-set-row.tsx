// TODO: Review this file
import { Badge } from '@ui/atoms/badge'
import type { SetData } from '../workout-queries'
import './exercise-set-row.scss'

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
    <div className="dk-exercise-set-row">
      <span className="dk-exercise-set-row__name">{name}</span>
      {category && (
        <Badge variant="secondary" className="dk-exercise-set-row__badge">
          {category.replace('_', ' ')}
        </Badge>
      )}
      <span className="dk-exercise-set-row__info">
        {sets.length} × {sets[0]?.reps ?? '?'}
        {sets[0]?.weightKg != null ? ` @ ${formatWeight(sets[0].weightKg)}` : ''}
      </span>
    </div>
  )
}
