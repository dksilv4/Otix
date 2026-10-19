import { useId, useState, type KeyboardEvent } from 'react'
import { FolderOpen, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePickFolder } from './use-pick-folder'
import type { FolderPickTarget } from './strategy'

export const PathInput = ({
  value,
  onChange,
  onCommit,
  label,
  placeholder,
  hint,
  target = 'local',
  serverId,
  id,
  compact = false,
  className,
  inputClassName,
  commitOnBlur = true,
  allowClear = true,
  showConfirmButton = true,
  confirmLabel,
}: {
  value: string
  onChange: (value: string) => void
  /** Called when the user browses to a folder, clears, presses Enter, or clicks Confirm. */
  onCommit?: (value: string) => void
  label?: string
  placeholder?: string
  hint?: string
  target?: FolderPickTarget
  serverId?: number
  id?: string
  compact?: boolean
  className?: string
  inputClassName?: string
  commitOnBlur?: boolean
  allowClear?: boolean
  showConfirmButton?: boolean
  confirmLabel?: string
}) => {
  const autoId = useId()
  const inputId = id || autoId
  const { pick, canBrowse } = usePickFolder({ target, serverId })
  const browseTitle = canBrowse ? 'Browse folder' : 'Connect a game server to browse folders'
  const [justConfirmed, setJustConfirmed] = useState(false)

  const triggerFeedback = () => {
    setJustConfirmed(true)
    setTimeout(() => setJustConfirmed(false), 2200)
  }

  const handleConfirm = () => {
    const next = value.trim()
    if (!next) return
    onCommit?.(next)
    triggerFeedback()
  }

  const handleBrowse = async () => {
    const dir = await pick()
    if (!dir) return
    onChange(dir)
    onCommit?.(dir)
    triggerFeedback()
  }

  const handleClear = () => {
    onChange('')
    onCommit?.('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const next = event.currentTarget.value.trim()
    onChange(next)
    onCommit?.(next)
    triggerFeedback()
  }

  const handleBlur = () => {
    if (!commitOnBlur) return
    const next = value.trim()
    onCommit?.(next)
  }

  return (
    <div className={cn(compact ? '' : 'space-y-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            type="text"
            value={value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className={cn(
              'h-9 w-full rounded-xl bg-[var(--dk-surface-field)] pl-3 pr-8 text-xs text-foreground outline-none placeholder:text-muted-foreground/50 focus:bg-[var(--dk-surface-ghost-hover)] transition-all duration-200',
              justConfirmed && 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-200',
              inputClassName,
            )}
          />
          {allowClear && Boolean(value) && (
            <button
              type="button"
              onClick={handleClear}
              title="Clear / Undo path selection"
              aria-label="Clear path"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground transition-colors cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={handleBrowse}
          disabled={!canBrowse}
          title={browseTitle}
          aria-label="Browse"
          className={cn(
            'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--dk-surface-field)] text-foreground/80 transition-colors hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer',
          )}
        >
          <FolderOpen className="h-4 w-4" />
        </button>
        {showConfirmButton && Boolean(onCommit) && (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!value.trim()}
            title={justConfirmed ? 'Path confirmed!' : (confirmLabel || 'Confirm path')}
            aria-label={confirmLabel || 'Confirm path'}
            className={cn(
              'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40',
              justConfirmed
                ? 'bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 shadow-sm shadow-emerald-500/20'
                : 'bg-[var(--dk-surface-field)] text-foreground/80 hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-300 active:scale-95',
            )}
          >
            <Check className={cn('h-4 w-4 transition-transform duration-200', justConfirmed ? 'text-emerald-600 dark:text-emerald-400 scale-110' : 'text-current')} />
            <span className="sr-only">{justConfirmed ? 'Confirmed!' : (confirmLabel || 'Confirm path')}</span>
          </button>
        )}
      </div>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
};
