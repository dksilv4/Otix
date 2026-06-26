/* ── LauncherLoading — fullscreen loading spinner ── */

import { Gamepad2 } from 'lucide-react'

export function LauncherLoading({ id }: { id?: string }) {
  return (
    <div id={id} className="flex items-center justify-center w-full bg-[#0a0a0d] text-white" style={{ height: 'calc(100vh - 5rem)' }}>
      <div className="text-center space-y-4">
        <Gamepad2 size={48} className="mx-auto opacity-30 animate-bounce"/>
        <p className="text-sm text-white/40">Loading Game Launcher...</p>
      </div>
    </div>
  )
}
