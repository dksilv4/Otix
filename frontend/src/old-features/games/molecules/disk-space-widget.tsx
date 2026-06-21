/* ── DiskSpaceWidget — self-contained multi-drive storage usage ── */

import { useState, useEffect } from 'react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { DriveRow } from '@/old-features/games/atoms/drive-row'

interface DiskInfo {
  drive: string
  total?: number
  used: number
  free: number
}

export function DiskSpaceWidget({ id }: { id?: string }) {
  const { isDesktop } = useDesktopPlatform()
  const [drives, setDrives] = useState<DiskInfo[]>([])

  useEffect(() => {
    const api = getDesktopAPI()
    if (!isDesktop || !api?.getDiskSpace) return
    api.getDiskSpace()
      .then(setDrives)
      .catch((err) => console.error('[DiskWidget] fetch failed:', err))
  }, [isDesktop])

  if (drives.length === 0) return null

  return (
    <div id={id} className="flex-1 rounded-2xl bg-white/3 p-4 max-w-sm animate-fade-in flex flex-col gap-2">
      <h3 className="text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1">Storage</h3>
      {drives.map((info, i) => (
        <DriveRow key={info.drive} index={i} {...info} />
      ))}
    </div>
  )
}
