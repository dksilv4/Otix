/* ── GameDetailButton — navigate to media detail page ── */

import {useNavigate, useParams} from '@tanstack/react-router'
import {useLocalGame} from '@/features/launcher/data/game-queries'


export function GameDetailButton() {
    const {gameId} = useParams({strict: false})
    const {data: g} = useLocalGame(gameId)
    const navigate = useNavigate()
    const mediaId = g?.data?.id
    if(!mediaId) return null
    return (
        <button
            onClick={() => navigate({to: '/media/$mediaType/$mediaId' as const, params: {mediaType: 'game', mediaId}})}
            className="px-3.5 py-2.5 bg-white/8 hover:bg-white/12 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-md active:scale-95 text-white/70"
        >
            Details
        </button>
    )
}
