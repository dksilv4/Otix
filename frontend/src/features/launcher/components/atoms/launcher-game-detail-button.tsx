import { Info } from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useLocalGame } from '@/features/launcher/data/game-queries'

export const GameDetailButton = () => {
  const { gameId } = useParams({ strict: false })
  const { data: g } = useLocalGame(gameId)
  const navigate = useNavigate()
  const mediaId = g?.data?.id
  if (!mediaId) return null

  return (
    <button
      onClick={() => navigate({ to: '/media/$mediaType/$mediaId' as const, params: { mediaType: 'game', mediaId } })}
      title="View full media details & community info"
      aria-label="View full media details & community info"
      className="w-10 h-10 bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] rounded-xl text-muted-foreground hover:text-foreground transition-all cursor-pointer backdrop-blur-md active:scale-95 flex items-center justify-center shrink-0"
    >
      <Info size={16} />
    </button>
  )
};
