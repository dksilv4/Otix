/* ── LauncherFooter — composes DiskSpaceWidget + LauncherScanWidget + Hydrate ── */

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop-api'
import { DiskSpaceWidget } from '@/features/games/molecules/disk-space-widget'
import { LauncherScanWidget } from '@/features/games/molecules/scan-widget'

export function LauncherFooter({ id }: { id?: string }) {
  const [hydrating, setHydrating] = useState(false)

  const handleHydrate = async () => {
    const api = getDesktopAPI()
    if (!api?.hydrateMatchedGames || hydrating) return
    setHydrating(true)
    try {
      const result = await api.hydrateMatchedGames()
      console.log(`[Hydrate] ${result.updated} updated, ${result.failed} failed, ${result.total} total`)
    } finally {
      setHydrating(false)
    }
  }

  return (
    <div id={id} className="flex flex-col md:flex-row justify-between items-stretch gap-6">
      <DiskSpaceWidget id="launcher-disk-widget" />
      <div className="flex items-center gap-3">
        <button
          onClick={handleHydrate}
          disabled={hydrating}
          className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-semibold text-white/50 hover:text-white/80 transition-all cursor-pointer disabled:opacity-30 active:scale-95"
          title="Hydrate all matched games with server data"
        >
          <RefreshCw size={12} className={hydrating ? 'animate-spin' : ''} />
          {hydrating ? 'Hydrating...' : 'Hydrate'}
        </button>
        <LauncherScanWidget id="launcher-scan-widget" />
      </div>
    </div>
  )
}
