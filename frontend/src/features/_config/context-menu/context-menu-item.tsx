import { forwardRef, type ForwardedRef } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContextMenuItemDef } from './types'

interface ContextMenuItemProps extends Omit<ContextMenuItemDef, 'id' | 'subItems'> {
  hasSubMenu?: boolean
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  className?: string
}

export const ContextMenuItem = forwardRef((
  {
    label,
    icon: Icon,
    shortcut,
    disabled,
    destructive,
    checked,
    onClick,
    hasSubMenu,
    onPointerEnter,
    onPointerLeave,
    className,
  }: ContextMenuItemProps,
  ref: ForwardedRef<HTMLButtonElement>,
) => {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onClick?.()
      }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors duration-150',
        disabled
          ? 'cursor-not-allowed opacity-40'
          : destructive
            ? 'text-destructive hover:bg-destructive/10'
            : 'text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground',
        className,
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="flex-1 text-left truncate">{label ?? ''}</span>
      {checked && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
      {shortcut && (
        <span className="shrink-0 text-[11px] text-muted-foreground/50">{shortcut}</span>
      )}
      {hasSubMenu && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
    </button>
  )
})
