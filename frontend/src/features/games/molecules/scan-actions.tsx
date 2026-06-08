/* ── ScanActions — scan now / configure paths / view library buttons ── */

import { Scan, Gamepad2, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScanActionsProps {
  id?: string
  scanning: boolean
  onScan: () => void
  onSettings: () => void
  onLibrary: () => void
}

export function ScanActions({ id, scanning, onScan, onSettings, onLibrary }: ScanActionsProps) {
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
          onClick={onScan}
          disabled={scanning}
          className="px-3.5 py-1.5 bg-white hover:bg-white/90 text-black rounded-xl text-[10px] font-black transition-colors cursor-pointer flex items-center gap-1"
        >
          <Scan size={12} className={cn(scanning && 'animate-spin')}/>
          {scanning ? 'Scanning...' : 'Scan Now'}
        </button>
        <button
          onClick={onSettings}
          className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-bold text-white/70 transition-colors cursor-pointer"
        >
          Configure Paths
        </button>
        <button
          onClick={onLibrary}
          className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 rounded-xl text-[10px] font-bold text-white transition-colors cursor-pointer"
        >
          View Full Library
        </button>
      </div>
    </div>
  )
}
