import { useId } from 'react'
import { FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePickFolder } from './use-pick-folder'
import type { FolderPickTarget } from './strategy'

export function PathInput({
  value,
  onChange,
  label,
  placeholder,
  hint,
  target = 'local',
  serverId,
  id,
  compact = false,
  className,
  inputClassName,
}: {
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  hint?: string
  target?: FolderPickTarget
  serverId?: number
  id?: string
  compact?: boolean
  className?: string
  inputClassName?: string
}) {
  const autoId = useId()
  const inputId = id || autoId
  const { pick, canBrowse } = usePickFolder({ target, serverId })
  const browseTitle = canBrowse ? 'Browse folder' : 'Connect a game server to browse folders'

  const handleBrowse = async () => {
    const dir = await pick()
    if (dir) onChange(dir)
  }

  return (
    <div className={cn(compact ? '' : 'space-y-1.5', className)}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-medium text-white/60">
          {label}
        </label>
      )}
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            'h-9 min-w-0 flex-1 rounded-xl bg-white/5 px-3 text-xs text-white outline-none placeholder:text-white/30 focus:bg-white/10',
            inputClassName,
          )}
        />
        <button
          type="button"
          onClick={handleBrowse}
          disabled={!canBrowse}
          title={browseTitle}
          aria-label="Browse"
          className={cn(
            'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40',
            compact ? 'h-9 w-9 p-0' : 'h-9 px-3',
          )}
        >
          <FolderOpen className="h-4 w-4" />
          {!compact && <span>Browse</span>}
        </button>
      </div>
      {hint && <p className="text-[11px] text-white/50">{hint}</p>}
    </div>
  )
}
