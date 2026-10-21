import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { ALL_PROFILE_SECTIONS } from '../../utils/profile-sections'

interface AddSectionButtonProps {
  currentSections: string[]
  username: string
}

export const AddSectionButton = ({ currentSections, username }: AddSectionButtonProps) => {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const missing = ALL_PROFILE_SECTIONS.filter((s) => !currentSections.includes(s.id))

  if (missing.length === 0) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex flex-col items-center py-8 rounded-2xl border border-dashed border-[var(--dk-separator)] hover:border-primary/40 hover:bg-[var(--dk-surface-ghost)] transition-all duration-200 cursor-pointer"
      >
        <Plus className="h-4 w-4 text-muted-foreground/60" />
        <span className="text-xs text-muted-foreground/60 mt-1 font-medium">
          Add Section
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 right-0 z-50 mt-2 rounded-2xl overflow-hidden border border-[var(--dk-separator)] bg-[var(--dk-surface-base)] backdrop-blur-2xl shadow-xl max-h-80 overflow-y-auto"
          >
            <p className="text-xs font-semibold uppercase tracking-wider px-4 py-2.5 text-muted-foreground/60 border-b border-[var(--dk-separator)]">
              Available Sections
            </p>
            <div className="p-1">
              {missing.map((section) => {
                const Icon = section.icon
                return (
                  <button
                    key={section.id}
                    type="button"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150 hover:bg-[var(--dk-surface-ghost)] cursor-pointer"
                    onClick={async () => {
                      const updated = [...currentSections, section.id]
                      await apiClient.patch('/auth/me', { profileSections: updated })
                      queryClient.invalidateQueries({ queryKey: ['user', username] })
                      setOpen(false)
                    }}
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
          </div>
        </>
      )}
    </div>
  )
}
