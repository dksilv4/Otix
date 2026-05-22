import { useState } from 'react'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/features/auth/auth-provider'
import { cn } from '@/lib/utils'

const EMPHASIS_OPTIONS = [
  { signalId: 'anime', label: 'Anime' },
  { signalId: 'k_drama', label: 'K-Dramas' },
  { signalId: 'k_pop', label: 'K-Pop' },
  { signalId: 'j_pop', label: 'J-Pop' },
  { signalId: 'j_drama', label: 'J-Dramas' },
  { signalId: 'c_drama', label: 'C-Dramas' },
  { signalId: 'latin_music', label: 'Latin Music' },
  { signalId: 'bollywood', label: 'Bollywood' },
] as const

interface EmphasisSelectorProps {
  emphases: string[]
  onChange: (emphases: string[]) => void
}

export function EmphasisSelector({ emphases, onChange }: EmphasisSelectorProps) {
  const [toggling, setToggling] = useState<string | null>(null)
  const { refreshUser } = useAuth()

  const handleToggle = async (signalId: string) => {
    setToggling(signalId)
    const next = emphases.includes(signalId)
      ? emphases.filter((id) => id !== signalId)
      : [...emphases, signalId]
    try {
      await apiClient.patch('/auth/me', { discover_emphases: next })
      onChange(next)
      await refreshUser()
    } catch {
      // revert silently on failure
    } finally {
      setToggling(null)
    }
  }

  if (EMPHASIS_OPTIONS.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {EMPHASIS_OPTIONS.map(({ signalId, label }) => {
        const isActive = emphases.includes(signalId)
        return (
          <button
            key={signalId}
            type="button"
            onClick={() => handleToggle(signalId)}
            disabled={toggling === signalId}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200',
              isActive
                ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
                : 'bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
