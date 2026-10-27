import { useState, useMemo, useCallback } from "react"
import { SlidersHorizontal, ChevronUp, ChevronDown, Check, RotateCcw, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { writeTabOrder, writeVisibility, resetTabPreferences } from "../utils"

export interface TabItemInfo {
  id: string
  label: string
  icon: React.ReactNode
}

export interface LibraryTabSettingsModalProps {
  allTabs: TabItemInfo[]
  currentOrder: string[]
  currentVisibility: string[]
  onSave: (order: string[], visibility: string[]) => void
  onClose: () => void
  isExiting?: boolean
}

export const LibraryTabSettingsModal = ({
  allTabs,
  currentOrder,
  currentVisibility,
  onSave,
  onClose,
  isExiting,
}: LibraryTabSettingsModalProps) => {
  // Build a lookup map from tab id to TabItemInfo
  const tabMap = useMemo(() => {
    return new Map(allTabs.map((t) => [t.id, t]))
  }, [allTabs])

  // Initial order: start from currentOrder, append any missing tabs from allTabs
  const [orderedIds, setOrderedIds] = useState<string[]>(() => {
    const existing = new Set<string>()
    const order: string[] = []
    for (const id of currentOrder) {
      if (tabMap.has(id) && !existing.has(id)) {
        order.push(id)
        existing.add(id)
      }
    }
    for (const tab of allTabs) {
      if (!existing.has(tab.id)) {
        order.push(tab.id)
      }
    }
    return order
  })

  // Visibility set
  const [visibleSet, setVisibleSet] = useState<Set<string>>(() => {
    return new Set(currentVisibility)
  })

  // Persist helper
  const commitChanges = useCallback(
    (newOrder: string[], newVisibleSet: Set<string>) => {
      const visibilityArr = Array.from(newVisibleSet)
      writeTabOrder(newOrder)
      writeVisibility(visibilityArr)
      onSave(newOrder, visibilityArr)
    },
    [onSave],
  )

  // Move a tab up in the display order
  const handleMoveUp = useCallback(
    (index: number) => {
      if (index <= 0) return
      setOrderedIds((prev) => {
        const next = [...prev]
        const temp = next[index - 1]
        next[index - 1] = next[index]
        next[index] = temp
        commitChanges(next, visibleSet)
        return next
      })
    },
    [commitChanges, visibleSet],
  )

  // Move a tab down in the display order
  const handleMoveDown = useCallback(
    (index: number) => {
      if (index >= orderedIds.length - 1) return
      setOrderedIds((prev) => {
        const next = [...prev]
        const temp = next[index + 1]
        next[index + 1] = next[index]
        next[index] = temp
        commitChanges(next, visibleSet)
        return next
      })
    },
    [commitChanges, orderedIds.length, visibleSet],
  )

  // Toggle visibility of a tab
  const handleToggleVisibility = useCallback(
    (id: string) => {
      setVisibleSet((prev) => {
        const next = new Set(prev)
        if (next.has(id)) {
          // Keep at least one tab visible
          if (next.size > 1) {
            next.delete(id)
          }
        } else {
          next.add(id)
        }
        commitChanges(orderedIds, next)
        return next
      })
    },
    [commitChanges, orderedIds],
  )

  // Reset to default ordering and visibility
  const handleResetToDefault = useCallback(() => {
    const defaultOrder = allTabs.map((t) => t.id)
    const defaultVisibility = new Set(defaultOrder)
    resetTabPreferences()
    setOrderedIds(defaultOrder)
    setVisibleSet(defaultVisibility)
    commitChanges(defaultOrder, defaultVisibility)
  }, [allTabs, commitChanges])

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-200",
        isExiting ? "opacity-0" : "opacity-100",
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          "relative w-full max-w-md overflow-hidden rounded-3xl bg-[var(--dk-surface-glass)]/95 backdrop-blur-2xl border border-white/[0.06] shadow-[var(--dk-shadow-dialog)] flex flex-col p-6 space-y-4 text-foreground transition-all duration-200",
          isExiting ? "scale-95 opacity-0" : "scale-100 opacity-100",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Customize Library Tabs</h3>
              <p className="text-xs text-muted-foreground">Reorder tabs and toggle visibility</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 transition-colors text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab List */}
        <div className="max-h-[360px] overflow-y-auto space-y-1.5 pr-1 scrollbar-none">
          {orderedIds.map((id, index) => {
            const tab = tabMap.get(id)
            if (!tab) return null
            const isVisible = visibleSet.has(id)
            const isFirst = index === 0
            const isLast = index === orderedIds.length - 1

            return (
              <div
                key={id}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-2 transition-colors",
                  isVisible
                    ? "bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)]"
                    : "bg-[var(--dk-surface-ghost)]/40 opacity-60 hover:opacity-90",
                )}
              >
                {/* Visibility check & label */}
                <button
                  type="button"
                  onClick={() => handleToggleVisibility(id)}
                  className="flex items-center gap-2.5 flex-1 min-w-0 text-left cursor-pointer"
                >
                  <span
                    className={cn(
                      "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                      isVisible
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30 bg-transparent",
                    )}
                  >
                    {isVisible && <Check className="h-3 w-3 stroke-[3]" />}
                  </span>
                  <span className="text-muted-foreground shrink-0">{tab.icon}</span>
                  <span className="text-sm font-medium text-foreground truncate">{tab.label}</span>
                </button>

                {/* Position reordering buttons */}
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    type="button"
                    onClick={() => handleMoveUp(index)}
                    disabled={isFirst}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                    aria-label={`Move ${tab.label} up`}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMoveDown(index)}
                    disabled={isLast}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] disabled:opacity-20 disabled:hover:bg-transparent transition-colors"
                    aria-label={`Move ${tab.label} down`}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.04]">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to default
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition-colors shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
