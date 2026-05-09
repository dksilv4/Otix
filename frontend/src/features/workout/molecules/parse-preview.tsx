import { CheckCircle2, XCircle } from 'lucide-react'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { cn } from '@/lib/utils'
import type { ParsedExercise } from '../lib/parser'
import type { MatchResult } from '../lib/matcher'

export interface MatchedExercise {
  parsed: ParsedExercise
  match: MatchResult
}

interface ParsePreviewProps {
  matched: MatchedExercise[]
  onConfirm: () => void
  isSubmitting: boolean
}

export function ParsePreview({ matched, onConfirm, isSubmitting }: ParsePreviewProps) {
  const allMatched = matched.every((m) => m.match.exercise != null)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <div className="h-px flex-1 bg-[var(--dk-border)]" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">parsed</span>
        <div className="h-px flex-1 bg-[var(--dk-border)]" />
      </div>

      <div className="space-y-1.5">
        {matched.map((m, i) => {
          const exercise = m.match.exercise
          const matched = exercise != null

          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                matched ? 'bg-emerald-500/5' : 'bg-red-500/5',
              )}
            >
              {matched ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 shrink-0 text-red-400" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">
                    {exercise?.name ?? m.parsed.name}
                  </span>
                  {exercise?.category && (
                    <span className="text-[10px] text-muted-foreground/50 uppercase">
                      {exercise.category.replace('_', ' ')}
                    </span>
                  )}
                  {!matched && (
                    <span className="text-[10px] text-red-400/70">unrecognized</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground/60">
                  {m.parsed.sets.length} × {m.parsed.sets[0]?.reps}
                  {m.parsed.sets[0]?.weightKg != null
                    ? ` @ ${m.parsed.sets[0].weightKg}kg`
                    : ''}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/40">
          {allMatched ? 'Ready to save' : 'Fix unrecognized exercises'}
        </span>
        <DkButton
          size="sm"
          disabled={!allMatched || isSubmitting}
          loading={isSubmitting}
          onClick={onConfirm}
        >
          Save Workout
        </DkButton>
      </div>
    </div>
  )
}
