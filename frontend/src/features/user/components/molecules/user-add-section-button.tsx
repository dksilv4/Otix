import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Crown, Plus, Star, BarChart3, Activity, Trophy } from 'lucide-react'
import { apiClient } from '@/lib/api/client'

const AVAILABLE_SECTIONS = [
  { id: 'hof_movie', label: 'Movie Hall of Fame', icon: Crown },
  { id: 'hof_show', label: 'Show Hall of Fame', icon: Crown },
  { id: 'hof_game', label: 'Game Hall of Fame', icon: Crown },
  { id: 'hof_music', label: 'Music Hall of Fame', icon: Crown },
  { id: 'library_breakdown', label: 'Library Breakdown', icon: BarChart3 },
  { id: 'mood_timeline', label: 'Mood Timeline', icon: Activity },
  { id: 'achievements', label: 'Achievements', icon: Trophy },
  { id: 'rating_distribution', label: 'Rating Distribution', icon: Star },
]

interface AddSectionButtonProps {
  currentSections: string[]
  username: string
}

export const AddSectionButton = ({ currentSections, username }: AddSectionButtonProps) => {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const missing = AVAILABLE_SECTIONS.filter((s) => !currentSections.includes(s.id))

  if (missing.length === 0) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex flex-col items-center py-8 rounded-2xl border border-dashed border-[var(--dk-separator)] hover:border-primary/40 hover:bg-[var(--dk-surface-ghost)] transition-all duration-200"
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
            className="absolute left-0 right-0 z-50 mt-2 rounded-2xl overflow-hidden border border-[var(--dk-separator)] bg-[var(--dk-surface-overlay)] backdrop-blur-2xl shadow-xl"
          >
            <p className="text-xs font-semibold uppercase tracking-wider px-3 py-2 text-muted-foreground/60">
              Available Sections
            </p>
            {missing.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  type="button"
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[var(--dk-surface-ghost-hover)]"
                  onClick={async () => {
                    const updated = [...currentSections, section.id]
                    await apiClient.put('/me/profile-sections', { sections: updated })
                    queryClient.invalidateQueries({ queryKey: ['user', username] })
                    setOpen(false)
                  }}
                >
                  <Icon className="h-4 w-4 text-muted-foreground/50" />
                  <span className="text-xs text-foreground font-medium">
                    {section.label}
                  </span>
                  <Plus className="h-4 w-4 ml-auto text-muted-foreground/40" />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
};
