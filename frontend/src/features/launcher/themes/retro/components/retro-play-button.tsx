import type { PlayButtonProps } from '../../types'

export function RetroPlayButton({ game }: PlayButtonProps) {
  return (
    <button
      className="px-8 py-3 bg-[#00ff41] text-black font-bold font-mono text-lg tracking-wider uppercase
        border-b-4 border-[#00aa2c] active:border-b-0 active:mt-1 transition-all"
      style={{
        boxShadow: '0 0 15px rgba(0,255,65,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
        textShadow: '0 1px 0 rgba(0,0,0,0.2)',
      }}
      onClick={() => {
        window.desktopAPI?.launchGame(game.id)
      }}
    >
      ▶ PLAY
    </button>
  )
}
