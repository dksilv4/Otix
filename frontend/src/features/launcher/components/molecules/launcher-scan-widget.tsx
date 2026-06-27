/* ── LauncherScanWidget — self-contained scan now / configure paths / view library ── */

import { useState, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Scan, Gamepad2, ChevronRight } from 'lucide-react'
import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop/api'
import { fetchIsoPaths } from '@/features/launcher/data/storage'
import { useToast } from '@/old-features/ui/molecules/toast'

export function LauncherScanWidget({ id }: { id?: string }) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [scanning, setScanning] = useState(false)

  const handleScan = useCallback(async () => {
    if (!hasDesktopAPI()) {
      toast({ title: 'Scanner Simulated', description: 'Web preview mode: Scanned 0 local game directories.', variant: 'info' })
      return
    }
    setScanning(true)
    try {
      const api = getDesktopAPI()!
      const paths = await api.getScanPaths()
      const gamePaths = paths.filter((p) => p.type === 'game').map((p) => p.path)
      const isoPaths = await fetchIsoPaths()
      const scanned = await api.scanPaths(gamePaths, isoPaths)
      if (scanned?.length) {
        toast({ title: 'Scan Complete', description: `Scanned ${scanned.length} games.`, variant: 'success' })
      } else {
        toast({ title: 'Scan Complete', description: 'No local games detected.', variant: 'default' })
      }
    } catch (err) {
      console.error('Scan failed:', err)
      toast({ title: 'Scan Failed', variant: 'error' })
    } finally {
      setScanning(false)
    }
  }, [toast])

  const goToSettings = useCallback(() => navigate({ to: '/settings', search: { section: 'scanners' } as never }), [navigate])
  const goToLibrary = useCallback(() => navigate({ to: '/library' }), [navigate])

  return (
    <div id={id} className="flex-1 rounded-2xl bg-white/3 border border-white/5 p-4 flex flex-col justify-between hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xs font-bold text-white/90 mb-1 flex items-center gap-1.5">
            <Gamepad2 size={13} className="text-pink-400"/>
            Scan and Manage Local Library
          </h3>
          <p className="text-[11px] text-white/40 max-w-md">
            Add installation folders in Settings and run a scanner to match local executables, track achievements, and launch games natively.
          </p>
        </div>
        <ChevronRight size={16} className="text-white/30 shrink-0 mt-0.5"/>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={handleScan}
          disabled={scanning}
          className="px-3.5 py-1.5 bg-white hover:bg-white/90 text-black rounded-xl text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1"
        >
          <Scan size={12} className={scanning ? 'animate-spin' : ''}/>
          {scanning ? 'Scanning...' : 'Scan Now'}
        </button>
        <button
          onClick={goToSettings}
          className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold text-white/70 transition-colors cursor-pointer"
        >
          Configure Paths
        </button>
        <button
          onClick={goToLibrary}
          className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 rounded-xl text-[10px] font-bold text-white transition-colors cursor-pointer"
        >
          View Full Library
        </button>
      </div>
    </div>
  )
}
