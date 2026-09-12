import { Info } from 'lucide-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useLocalGame } from '@/features/launcher/data/game-queries'

export function GameDetailButton() {
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
      className="w-10 h-10 bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 rounded-xl text-white/70 hover:text-white transition-all cursor-pointer backdrop-blur-md active:scale-95 flex items-center justify-center shrink-0"
    >
      <Info size={16} />
    </button>
  )
}
