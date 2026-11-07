import { useState, useEffect } from 'react'
import { ArrowRight, ChevronDown, ChevronUp, Folder } from 'lucide-react'
import { FileRow } from './file-row'
import {
  type DirectoryGroup,
  isActionableItem,
} from '../../../utils/organize-test-run'

export interface DirectorySectionProps {
  group: DirectoryGroup
  rootDir?: string
  forceExpanded?: boolean | null
}

export const DirectorySection = ({
  group,
  rootDir,
  forceExpanded,
}: DirectorySectionProps) => {
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    if (forceExpanded !== null && forceExpanded !== undefined) {
      setExpanded(forceExpanded)
    }
  }, [forceExpanded])

  const isChanged = group.sourceDir.toLowerCase() !== group.targetDir.toLowerCase()
  const hasActionable = group.items.some(isActionableItem)
  const isAllOrganized = group.items.every((i) => i.status === 'already_organized')

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] overflow-hidden transition-all duration-200">
      {/* Directory Section Header (Clean single bar) */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center justify-between p-3 sm:p-3.5 hover:bg-white/[0.02] cursor-pointer text-left transition-colors select-none"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-1.5 rounded-lg bg-primary/10 text-primary shrink-0">
            <Folder size={15} />
          </div>
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-xs sm:text-sm font-bold text-foreground font-mono truncate">
              {group.sourceDir}
            </span>
            {isChanged && (
              <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm">
                <ArrowRight size={12} className="text-primary shrink-0" />
                <span className="font-bold text-primary font-mono truncate">{group.targetDir}</span>
              </span>
            )}
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground">
              {group.items.length} {group.items.length === 1 ? 'file' : 'files'}
            </span>
            {hasActionable && (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Actionable
              </span>
            )}
            {isAllOrganized && (
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground">
                All organized
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground shrink-0 pl-2">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded directory content */}
      {expanded && (
        <div className="border-t border-white/[0.03] bg-black/10">
          <div className="divide-y divide-white/[0.02]">
            {group.items.map((item, idx) => (
              <FileRow
                key={`${item.sourceFilename}-${idx}`}
                item={item}
                rootDir={rootDir}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
