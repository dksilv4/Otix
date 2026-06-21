/* ── MatchedPlayButton — navigate to media detail when game is matched ── */

import { Play } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'

interface Props {
  mediaId: string
}

export function MatchedPlayButton({ mediaId }: Props) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate({ to: '/media/$mediaType/$mediaId' as const, params: { mediaType: 'game', mediaId } })}
      className="px-5.5 py-2.5 bg-white hover:bg-white/90 text-black rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
    >
      <Play size={14} fill="currentColor" /> Play
    </button>
  )
}
