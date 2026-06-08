/* ── DiskSpaceWidget — self-contained storage usage bar, fetches own data ── */

import { useState, useEffect } from 'react'
import { HardDrive } from 'lucide-react'
import { getDesktopAPI } from '@/lib/desktop-api'
import { useDesktopPlatform } from '@/lib/desktop-platform'

interface DiskInfo {
  drive: string
  total?: number
  used: number
  free: number
}

function formatBytes(bytes: number) {
  const gb = bytes / (1024 * 1024 * 1024)
  return gb >= 1 ? `${gb.toFixed(0)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

export function DiskSpaceWidget({ id }: { id?: string }) {
  const { isDesktop } = useDesktopPlatform()
  const [info, setInfo] = useState<DiskInfo | null>(null)

  useEffect(() => {
    const api = getDesktopAPI()
    if (!isDesktop || !api?.getDiskSpace) return
    api.getDiskSpace()
      .then((drives: DiskInfo[]) => {
        if (drives.length > 0) setInfo(drives[0])
      })
      .catch((err) => console.error('[DiskWidget] fetch failed:', err))
  }, [isDesktop])

  if (!info) return null

  const usedPct = (info.used / (info.total || info.used + info.free)) * 100

  return (
    <div id={id} className="flex-1 rounded-2xl bg-white/5 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition-colors max-w-sm animate-fade-in">
      <div className="flex items-center gap-2.5 mb-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500/15 to-blue-600/5 flex items-center justify-center border border-white/5">
          <HardDrive size={14} className="text-blue-400"/>
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[11px] font-bold text-white/90">{info.drive}</span>
          <span className="text-[10px] text-white/40 ml-2">{formatBytes(info.free)} free</span>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
          style={{ width: `${usedPct}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-white/30 font-semibold">
        <span>{formatBytes(info.used)} used</span>
        <span>{formatBytes(info.free)} free</span>
      </div>
    </div>
  )
}
