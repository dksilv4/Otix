import { Link } from '@tanstack/react-router'
import { Gamepad2 } from 'lucide-react'

export function LauncherNotFound() {
  return (
    <div className="w-full h-full min-h-screen bg-[#0a0a0d] flex items-center justify-center">
      <div className="text-center space-y-4">
        <Gamepad2 size={64} className="mx-auto opacity-20" />
        <h1 className="text-3xl font-black text-white/70">404</h1>
        <p className="text-sm text-white/40 max-w-xs">This game page doesn't exist or has been removed.</p>
        <Link to="/game" className="inline-block mt-4 px-4 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-sm text-white/70 transition-all">
          Back to Games
        </Link>
      </div>
    </div>
  )
}
