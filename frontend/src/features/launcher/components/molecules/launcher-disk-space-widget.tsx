/* ── DiskSpaceWidget — multi-drive storage with scan-path markers ── */

import { useState, useEffect, useMemo } from 'react'
import { getDesktopAPI } from '@/lib/desktop/api'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import { DriveRow } from '@/features/launcher/components/atoms/launcher-drive-row'
import { extractDrive } from '@/features/launcher/utils'

interface DiskInfo {
  drive: string
  total?: number
  used: number
  free: number
}

export const DiskSpaceWidget = ({ id }: { id?: string }) => {
  const { isDesktop } = useDesktopPlatform()
  const [drives, setDrives] = useState<DiskInfo[]>([])
  const [gameDrives, setGameDrives] = useState<Set<string>>(new Set())
  const [isoDrives, setIsoDrives] = useState<Set<string>>(new Set())

  useEffect(() => {
    const api = getDesktopAPI()
    if (!isDesktop) return

    // Disk space — system-reported drives
    if (api?.getDiskSpace) {
      api.getDiskSpace()
        .then((sysDrives) => {
          // Drive letters from getDiskSpace
          const systemDriveKeys = new Set(sysDrives.map((d) => extractDrive(d.drive) || d.drive))

          // Scan paths may contain extra drives (mounted ISOs, network, removable)
          if (api?.getScanPaths) {
            api.getScanPaths()
              .then((paths) => {
                const game = new Set<string>()
                const iso = new Set<string>()
                const extraDrives: DiskInfo[] = []

                for (const p of paths) {
                  const d = extractDrive(p.path)
                  if (!d) continue
                  if (p.type === 'game') game.add(d)
                  else if (p.type === 'iso') iso.add(d)

                  // Add drives that system didn't report (e.g., mounted ISOs)
                  if (!systemDriveKeys.has(d)) {
                    systemDriveKeys.add(d)
                    extraDrives.push({ drive: d, used: 0, free: 0 })
                  }
                }

                setGameDrives(game)
                setIsoDrives(iso)
                setDrives([...sysDrives, ...extraDrives])
              })
              .catch(() => {
                setDrives(sysDrives)
              })
          } else {
            setDrives(sysDrives)
          }
        })
        .catch((err) => console.error('[DiskWidget] fetch failed:', err))
    } else if (api?.getScanPaths) {
      // No getDiskSpace, but we have scan paths — show those drives
      api.getScanPaths()
        .then((paths) => {
          const seen = new Set<string>()
          const scanDrives: DiskInfo[] = []
          const game = new Set<string>()
          const iso = new Set<string>()

          for (const p of paths) {
            const d = extractDrive(p.path)
            if (!d || seen.has(d)) continue
            seen.add(d)
            if (p.type === 'game') game.add(d)
            else if (p.type === 'iso') iso.add(d)
            scanDrives.push({ drive: d, used: 0, free: 0 })
          }

          setGameDrives(game)
          setIsoDrives(iso)
          setDrives(scanDrives)
        })
        .catch(() => {})
    }
  }, [isDesktop])

  const annotatedDrives = useMemo(() =>
    drives.map((d) => ({
      ...d,
      hasGamePaths: gameDrives.has(extractDrive(d.drive) || d.drive),
      hasIsoPaths: isoDrives.has(extractDrive(d.drive) || d.drive),
    })),
  [drives, gameDrives, isoDrives])

  if (drives.length === 0) return null

  return (
    <div id={id} className="flex-1 rounded-2xl bg-white/3 p-4 max-w-sm animate-fade-in flex flex-col gap-2">
      <h3 className="text-[11px] font-bold text-white/50 uppercase tracking-wider mb-1">Storage</h3>
      {annotatedDrives.map((info, i) => (
        <DriveRow key={info.drive} index={i} {...info} />
      ))}
    </div>
  )
};
