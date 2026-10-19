import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { ActionButton } from '../../types'

interface NotificationActionsProps {
  actions: ActionButton[]
}

const variants = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-[var(--dk-surface-ghost)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground',
  danger: 'bg-destructive/15 text-destructive hover:bg-destructive/25',
}

export const NotificationActions = ({ actions }: NotificationActionsProps) => {
  const [pendingLabel, setPendingLabel] = useState<string | null>(null)

  if (actions.length === 0) return null
  return (
    <div className="flex gap-2 mt-2">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          disabled={pendingLabel !== null}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            if (pendingLabel !== null) return
            setPendingLabel(action.label)
            void Promise.resolve(action.onClick()).finally(() => {
              setPendingLabel(null)
            })
          }}
          className={cn(
            'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
            variants[action.variant],
          )}
        >
          {pendingLabel === action.label ? '…' : action.label}
        </button>
      ))}
    </div>
  )
};
