// TODO: Review this file
import { CheckCircle2, XCircle } from 'lucide-react'
import { DkButton } from '@/old-features/ui/atoms/button'
import type { ParsedExercise } from '../lib/parser'
import type { MatchResult } from '../lib/matcher'
import './parse-preview.scss'

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
    <div className="dk-parse-preview">
      <div className="dk-parse-preview__divider">
        <div className="dk-parse-preview__divider-line" />
        <span className="dk-parse-preview__divider-label">parsed</span>
        <div className="dk-parse-preview__divider-line" />
      </div>

      <div className="dk-parse-preview__list">
        {matched.map((m, i) => {
          const exercise = m.match.exercise
          const matched = exercise != null

          return (
            <div
              key={i}
              className={`dk-parse-preview__row dk-parse-preview__row--${matched ? 'matched' : 'unmatched'}`}
            >
              {matched ? (
                <CheckCircle2 className="dk-parse-preview__icon dk-parse-preview__icon--matched" />
              ) : (
                <XCircle className="dk-parse-preview__icon dk-parse-preview__icon--unmatched" />
              )}
              <div className="dk-parse-preview__content">
                <div className="dk-parse-preview__header">
                  <span className="dk-parse-preview__name">
                    {exercise?.name ?? m.parsed.name}
                  </span>
                  {exercise?.category && (
                    <span className="dk-parse-preview__category">
                      {exercise.category.replace('_', ' ')}
                    </span>
                  )}
                  {!matched && (
                    <span className="dk-parse-preview__unrecognized">unrecognized</span>
                  )}
                </div>
                <div className="dk-parse-preview__sets">
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

      <div className="dk-parse-preview__footer">
        <span className="dk-parse-preview__status">
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
