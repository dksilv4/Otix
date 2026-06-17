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

export function AddSectionButton({ currentSections, username }: AddSectionButtonProps) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const missing = AVAILABLE_SECTIONS.filter((s) => !currentSections.includes(s.id))

  if (missing.length === 0) return null

  return (
    <div className="dk-user-profile-page__add-section">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="dk-user-profile-page__add-section-trigger"
      >
        <Plus className="h-4 w-4 text-muted-foreground/30" />
        <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>
          Add Section
        </span>
      </button>

      {open && (
        <>
          <div
            className="dk-user-profile-page__add-section-overlay"
            onClick={() => setOpen(false)}
          />
          <div className="dk-user-profile-page__add-section-dropdown">
            <p className="dk-user-profile-page__add-section-label">Available Sections</p>
            {missing.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  type="button"
                  className="dk-user-profile-page__add-section-item"
                  onClick={async () => {
                    const updated = [...currentSections, section.id]
                    await apiClient.put('/me/profile-sections', { sections: updated })
                    queryClient.invalidateQueries({ queryKey: ['user', username] })
                    setOpen(false)
                  }}
                >
                  <Icon className="h-4 w-4 text-muted-foreground/50" />
                  <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                    {section.label}
                  </span>
                  <Plus className="h-4 w-4 ml-auto text-muted-foreground/30" />
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
