import { useState, useRef, useEffect } from 'react'
import { SlidersHorizontal, Check, RotateCcw } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import {
  type NodeScanColumnId,
  SCAN_TABLE_COLUMNS,
} from '../../utils/node-scan-files'
import { cn } from '@/lib/utils'

export interface NodeScanColumnSettingsProps {
  visibleColumns: Record<NodeScanColumnId, boolean>
  onToggleColumn: (id: NodeScanColumnId) => void
  onResetColumns: () => void
  className?: string
}

export const NodeScanColumnSettings = ({
  visibleColumns,
  onToggleColumn,
  onResetColumns,
  className,
}: NodeScanColumnSettingsProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  // Filter columns that can be toggled (skip alwaysVisible like title & actions)
  const toggleableColumns = SCAN_TABLE_COLUMNS.filter((col) => !col.alwaysVisible)

  return (
    <div ref={menuRef} className={cn('relative inline-flex items-center justify-center', className)}>
      <DkButton
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((prev) => !prev)
        }}
        className={cn(
          'h-6 w-6 p-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-all cursor-pointer flex items-center justify-center mx-auto',
          isOpen && 'bg-[var(--dk-surface-ghost-hover)] text-foreground',
        )}
        title="Customize visible columns"
        aria-label="Customize visible columns"
        aria-expanded={isOpen}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </DkButton>

      {isOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1.5 w-56 rounded-2xl bg-[var(--dk-surface-overlay)] backdrop-blur-2xl border border-white/[0.06] shadow-[var(--dk-shadow-dialog)] z-50 p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-150 normal-case tracking-normal font-normal text-left"
          style={{ backgroundColor: 'var(--dk-surface-overlay)' }}
        >
          <div className="flex items-center justify-between px-1.5 pt-0.5 pb-1 border-b border-white/[0.04]">
            <span className="text-[11px] font-semibold text-foreground">
              Visible Columns
            </span>
            <button
              type="button"
              onClick={onResetColumns}
              className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 cursor-pointer transition-colors"
              title="Reset columns to default"
            >
              <RotateCcw className="h-2.5 w-2.5" />
              <span>Reset</span>
            </button>
          </div>

          <div className="space-y-0.5">
            {toggleableColumns.map((col) => {
              const isChecked = Boolean(visibleColumns[col.id])
              return (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => onToggleColumn(col.id)}
                  className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs hover:bg-[var(--dk-surface-ghost)] text-foreground transition-colors cursor-pointer select-none text-left"
                >
                  <span className={cn('text-xs', !isChecked && 'text-muted-foreground')}>
                    {col.label}
                  </span>
                  <div
                    className={cn(
                      'h-4 w-4 rounded-md flex items-center justify-center transition-all',
                      isChecked
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-white/[0.15] bg-[var(--dk-surface-base)]',
                    )}
                  >
                    {isChecked && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
