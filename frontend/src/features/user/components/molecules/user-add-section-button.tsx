import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, X, SlidersHorizontal } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { ALL_PROFILE_SECTIONS } from '../../utils/profile-sections'

export interface AddSectionButtonProps {
  currentSections: string[]
  username: string
  onRemoveSection?: (sectionId: string) => void | Promise<void>
  onAddSection?: (sectionId: string) => void | Promise<void>
}

export const AddSectionButton = ({
  currentSections,
  username,
  onRemoveSection,
  onAddSection,
}: AddSectionButtonProps) => {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const missing = ALL_PROFILE_SECTIONS.filter((s) => !currentSections.includes(s.id))
  const active = ALL_PROFILE_SECTIONS.filter((s) => currentSections.includes(s.id))

  const handleAdd = async (sectionId: string) => {
    if (onAddSection) {
      await onAddSection(sectionId)
    } else {
      const updated = [...currentSections, sectionId]
      await apiClient.patch('/auth/me', { profileSections: updated })
      queryClient.invalidateQueries({ queryKey: ['user', username] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    }
    setOpen(false)
  }

  const handleRemove = async (sectionId: string) => {
    if (onRemoveSection) {
      await onRemoveSection(sectionId)
    } else {
      const updated = currentSections.filter((id) => id !== sectionId)
      await apiClient.patch('/auth/me', { profileSections: updated })
      queryClient.invalidateQueries({ queryKey: ['user', username] })
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex flex-col items-center py-6 rounded-2xl border border-dashed border-white/[0.08] hover:border-primary/40 hover:bg-[var(--dk-surface-ghost)] transition-all duration-200 cursor-pointer"
      >
        {missing.length > 0 ? (
          <>
            <Plus className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground/60 mt-1 font-medium">
              Add Section
            </span>
          </>
        ) : (
          <>
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground/60 mt-1 font-medium">
              Manage Sections
            </span>
          </>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 right-0 z-50 mt-2 rounded-2xl overflow-hidden border border-white/[0.06] bg-[var(--dk-surface-base)] backdrop-blur-2xl shadow-xl max-h-96 overflow-y-auto"
          >
            {missing.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider px-4 py-2.5 text-muted-foreground/60 border-b border-white/[0.06]">
                  Available Sections
                </p>
                <div className="p-1 space-y-0.5">
                  {missing.map((section) => {
                    const Icon = section.icon
                    return (
                      <button
                        key={section.id}
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 hover:bg-[var(--dk-surface-ghost)] cursor-pointer"
                        onClick={() => void handleAdd(section.id)}
                      >
                        <Icon className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-foreground font-medium truncate">
                            {section.title}
                          </span>
                          <span className="text-[11px] text-muted-foreground truncate">
                            {section.description}
                          </span>
                        </div>
                        <Plus className="h-4 w-4 ml-auto text-muted-foreground/40 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </>
            )}

            {active.length > 0 && (
              <>
                <p className="text-xs font-semibold uppercase tracking-wider px-4 py-2.5 text-muted-foreground/60 border-t border-b border-white/[0.06] mt-1">
                  Active Sections ({active.length})
                </p>
                <div className="p-1 space-y-0.5">
                  {active.map((section) => {
                    const Icon = section.icon
                    return (
                      <div
                        key={section.id}
                        className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg transition-colors duration-150 hover:bg-[var(--dk-surface-ghost)]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon className="h-4 w-4 text-primary shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-xs text-foreground font-medium truncate">
                              {section.title}
                            </span>
                            <span className="text-[11px] text-muted-foreground truncate">
                              {section.description}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          title={`Remove ${section.title}`}
                          aria-label={`Remove ${section.title}`}
                          className="p-1.5 rounded-full text-muted-foreground/60 hover:text-destructive hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer shrink-0"
                          onClick={() => void handleRemove(section.id)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
