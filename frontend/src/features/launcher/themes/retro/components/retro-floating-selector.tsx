import { usePopularGames } from '@/features/launcher/queries'
import { useLocalGames } from '@/old-features/game-scanner/game-queries'
import { toDisplayGame } from '@/features/launcher/utils'
import { useNavigate } from '@tanstack/react-router'

export function RetroFloatingSelector() {
  const navigate = useNavigate()
  const { data: popularGames } = usePopularGames()
  const { data: localGames = [] } = useLocalGames()
  const allGames = [...localGames.map(toDisplayGame), ...(popularGames ?? [])].slice(0, 10)

  return (
    <div className="fixed top-4 right-4 z-50 bg-black border border-[#00ff41]/30 p-2 font-mono text-sm"
      style={{ boxShadow: '0 0 15px rgba(0,255,65,0.15)' }}>
      <div className="text-[#00ff41]/60 text-xs mb-1 tracking-wider">SELECT GAME</div>
      {allGames.map((game, i) => (
        <button
          key={game.id}
          className="block w-full text-left px-2 py-1 text-[#00ff41] hover:bg-[#00ff41]/10 text-xs tracking-wider"
          onClick={() => navigate({ to: '/launcher/$gameId', params: { gameId: game.id } })}
        >
          <span className="text-[#00ff41]/40 mr-2">{String(i + 1).padStart(2, '0')}</span>
          {game.name}
        </button>
      ))}
    </div>
  )
}
