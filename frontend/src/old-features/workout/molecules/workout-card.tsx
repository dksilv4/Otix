// TODO: Review this file
import { Trash2 } from 'lucide-react'
import { DkCard } from '@/old-features/dk-ui/molecules/card'
import { DkButton } from '@/old-features/dk-ui/atoms/button'
import type { WorkoutListOut } from '../workout-queries'
import './workout-card.scss'

interface WorkoutCardProps {
  workout: WorkoutListOut
  onDelete: (id: string) => void
  isDeleting: boolean
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatWeight(kg: number | null): string {
  if (kg == null) return ''
  if (kg >= 20) return `${kg}kg`
  return `${(kg * 2.20462).toFixed(0)}lbs`
}

export function WorkoutCard({ workout, onDelete, isDeleting }: WorkoutCardProps) {
  return (
    <DkCard elevation="sm" className="dk-workout-card">
      <div className="dk-workout-card__body">
        <div className="dk-workout-card__content">
          <div className="dk-workout-card__header">
            <span className="dk-workout-card__date">
              {formatDate(workout.startedAt)}
            </span>
            <span className="dk-workout-card__set-count">
              {workout.totalSets} set{workout.totalSets !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="dk-workout-card__exercises">
            {workout.exercises.map((ex, i) => (
              <div key={i} className="dk-workout-card__exercise">
                <span className="dk-workout-card__exercise-name">{ex.exerciseName}</span>
                <span className="dk-workout-card__exercise-sets">
                  {ex.sets.length} × {ex.sets[0]?.reps}
                  {ex.sets[0]?.weightKg != null ? ` ${formatWeight(ex.sets[0].weightKg)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DkButton
          variant="ghost"
          size="icon"
          onClick={() => onDelete(workout.id)}
          disabled={isDeleting}
          className="dk-workout-card__delete-btn"
        >
          <Trash2 className="h-4 w-4" />
        </DkButton>
      </div>
    </DkCard>
  )
}
