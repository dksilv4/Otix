import { useState } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { cn } from '@/lib/utils'
import type { ParsedExercise } from '../lib/parser'
import type { MatchResult } from '../lib/matcher'
import type { ExerciseEntry } from '../lib/exercises'

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
  const [edits, setEdits] = useState<Map<number, ExerciseEntry | null>>(new Map())

  const handleSelectAlternative = (index: number, exercise: ExerciseEntry | null) => {
    const next = new Map(edits)
    next.set(index, exercise)
    setEdits(next)
  }

  const getExercise = (index: number, m: MatchedExercise): ExerciseEntry | null => {
    if (edits.has(index)) return edits.get(index)!
    return m.match.exercise
  }

  const allMatched = matched.every((m, i) => {
    const ex = getExercise(i, m)
    return ex != null && (m.match.confidence >= 0.4 || edits.has(i))
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <div className="h-px flex-1 bg-[var(--dk-border)]" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/40">parsed</span>
        <div className="h-px flex-1 bg-[var(--dk-border)]" />
      </div>

      <div className="space-y-1.5">
        {matched.map((m, i) => {
          const exercise = getExercise(i, m)
          const isHighConf = m.match.confidence >= 0.4
          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                isHighConf
                  ? 'bg-emerald-500/5'
                  : 'bg-amber-500/5',
              )}
            >
              {isHighConf ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
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
                </div>
                <div className="text-xs text-muted-foreground/60">
                  {m.parsed.sets.length} × {m.parsed.sets[0]?.reps}
                  {m.parsed.sets[0]?.weightKg != null
                    ? ` @ ${m.parsed.sets[0].weightKg}kg`
                    : ''}
                </div>
              </div>
              {!isHighConf && m.match.alternatives.length > 0 && (
                <select
                  className="h-7 rounded-lg border border-[var(--dk-border)] bg-[var(--dk-surface-field)] px-1.5 text-xs"
                  onChange={(e) => {
                    const idx = parseInt(e.target.value)
                    handleSelectAlternative(i, idx >= 0 ? m.match.alternatives[idx] : null)
                  }}
                  defaultValue=""
                >
                  <option value="">Pick...</option>
                  {m.match.alternatives.map((alt, ai) => (
                    <option key={ai} value={ai}>
                      {alt.name}
                    </option>
                  ))}
                  <option value="-1">Custom</option>
                </select>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/40">
          {allMatched ? 'Ready to save' : 'Fix highlighted exercises'}
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
