import React, { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DkDialog } from '@/old-features/ui/molecules/dialog'
import { DkButton } from '@/old-features/ui/atoms/button'
import type { ArrServiceInstance } from '../arr-instances'

export function ArrInstanceSwitcher({
  instances,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
}: {
  instances: ArrServiceInstance[]
  selectedId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onDelete: (id: string) => void
  accentClass?: string
}) {
  const canDelete = instances.length > 1
  const [pendingDelete, setPendingDelete] = useState<ArrServiceInstance | null>(null)

  return (
    <>
      <div role="tablist" className="flex flex-wrap items-center gap-1">
        {instances.map((inst) => {
          const selected = inst.id === selectedId
          return (
            <div
              key={inst.id}
              role="tab"
              aria-selected={selected}
              tabIndex={0}
              onClick={() => onSelect(inst.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(inst.id)
                }
              }}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg p-2 text-xs font-medium transition-colors cursor-pointer',
                selected ? 'bg-white/15 text-white' : 'bg-white/10 text-white/50 hover:bg-white/15 hover:text-white'
              )}
            >
              <span className="min-w-0 truncate">{inst.name}</span>
              <span className="inline-flex h-3 w-3 shrink-0 items-center justify-center">
                {selected && canDelete ? (
                  <button
                    type="button"
                    aria-label={`Delete ${inst.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPendingDelete(inst)
                    }}
                    className="inline-flex h-3 w-3 items-center justify-center rounded bg-white/10 text-white/40 transition-colors hover:bg-white/15 hover:text-rose-400 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
              <span
                className={cn(
                  'ml-auto h-1.5 w-1.5 shrink-0 rounded-full',
                  inst.enabled ? 'bg-emerald-400' : 'bg-white/30'
                )}
                aria-hidden="true"
              />
            </div>
          )
        })}
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-8 items-center gap-1 rounded-lg bg-white/10 p-2 text-xs font-medium text-white/70 hover:bg-white/15 hover:text-white cursor-pointer"
        >
          <Plus className="h-3 w-3" />
          Add instance
        </button>
      </div>

      <DkDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
        title={pendingDelete ? `Delete ${pendingDelete.name}?` : 'Delete instance?'}
        description="This removes the instance from this form. Save to persist the change."
        showAmbient={false}
      >
        <div className="mt-5 flex items-center justify-end gap-3">
          <DkButton type="button" variant="ghost" size="md" onClick={() => setPendingDelete(null)}>
            Cancel
          </DkButton>
          <DkButton
            type="button"
            variant="destructive"
            size="md"
            onClick={() => {
              if (!pendingDelete) return
              onDelete(pendingDelete.id)
              setPendingDelete(null)
            }}
          >
            Delete
          </DkButton>
        </div>
      </DkDialog>
    </>
  )
}
