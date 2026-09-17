import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { DkInput } from '@ui/atoms/input'
import { cn } from '@/lib/utils'

export interface PathMappingRow {
  remotePath: string
  hostPath: string
  linked?: boolean
  error?: string
}

export function IntegrationPathMappings({
  mappings,
  onChange,
  folderError,
  addButtonClass = 'bg-amber-500 text-black hover:bg-amber-400 shadow-amber-500/20',
}: {
  mappings: PathMappingRow[]
  onChange: (next: PathMappingRow[]) => void
  folderError?: string
  addButtonClass?: string
}) {
  const anyLinked = mappings.some((mapping) => mapping.linked)
  const showDiscovery = Boolean(folderError) && !anyLinked

  return (
    <div className="space-y-3">
      {showDiscovery && (
        <div className="space-y-1">
          <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
            Not found
          </span>
          <p className="text-sm font-semibold text-white">Folder not found yet</p>
          <p className="text-xs leading-relaxed text-white/60">
            Point the remote path at the completed download folder, then save so Otix can link it.
          </p>
        </div>
      )}

      {mappings.map((mapping, index) => (
        <div key={index} className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/50">Mapping {index + 1}</span>
            <div className="flex items-center gap-2">
              {mapping.linked && (
                <span className="text-xs font-medium text-emerald-400">Linked</span>
              )}
              {mappings.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(mappings.filter((_, i) => i !== index))}
                  className="rounded-lg p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-rose-400 cursor-pointer"
                  aria-label={`Remove path mapping ${index + 1}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <DkInput
              id={`remote-path-${index}`}
              label="Remote path"
              placeholder="e.g. /downloads/complete"
              value={mapping.remotePath}
              onChange={(e) =>
                onChange(
                  mappings.map((item, i) =>
                    i === index ? { ...item, remotePath: e.target.value, linked: false, error: '' } : item
                  )
                )
              }
            />
            <DkInput
              id={`host-path-${index}`}
              label="Local path"
              placeholder="Same as remote path when left empty"
              value={mapping.hostPath}
              onChange={(e) =>
                onChange(
                  mappings.map((item, i) =>
                    i === index ? { ...item, hostPath: e.target.value, linked: false, error: '' } : item
                  )
                )
              }
            />
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...mappings, { remotePath: '', hostPath: '', linked: false, error: '' }])}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors cursor-pointer',
          addButtonClass
        )}
      >
        <Plus className="h-3.5 w-3.5" />
        Add mapping
      </button>
      <p className="pl-4 text-xs leading-relaxed text-white/50">
        Both paths must point to the same shared folder.
      </p>
    </div>
  )
}
