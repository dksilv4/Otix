import { cn } from '@/lib/utils'
import type { ActionButton } from '../../types'

interface NotificationActionsProps {
  actions: ActionButton[]
}

const variants = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  secondary: 'bg-white/10 text-white/60 hover:bg-white/[0.08]',
  danger: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
}

export function NotificationActions({ actions }: NotificationActionsProps) {
  if (actions.length === 0) return null
  return (
    <div className="flex gap-2 mt-2">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          className={cn(
            'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all cursor-pointer',
            variants[action.variant],
          )}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}
