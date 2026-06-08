/* ── WebPreviewBanner — shown when running outside Electron desktop app ── */

import { isDesktop } from '@/lib/desktop-api'

export function WebPreviewBanner({ id }: { id?: string }) {
  const desktop = isDesktop()
  if (desktop) return null
  return (
    <div id={id} className="absolute top-4 left-[92px] right-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] px-3.5 py-2 rounded-xl flex items-center justify-between gap-3 z-30 backdrop-blur-md">
      <div className="flex items-center gap-1.5">
        <span className="flex h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"/>
        <span><strong>Web Preview:</strong> Scans, play actions, and storage details are simulated. Run in the desktop app for native folder launching.</span>
      </div>
    </div>
  )
}
