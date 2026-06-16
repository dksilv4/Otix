/* ── DriveRow — single drive row with progress bar ── */

import { motion } from 'framer-motion'
import { HardDrive } from 'lucide-react'

interface DriveInfo {
  drive: string
  total?: number
  used: number
  free: number
}

function formatBytes(bytes: number) {
  const gb = bytes / (1024 * 1024 * 1024)
  return gb >= 1 ? `${gb.toFixed(0)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`
}

export function DriveRow({ drive, total, used, free, index = 0 }: DriveInfo & { index?: number }) {
  const totalBytes = total || used + free
  const usedPct = (used / totalBytes) * 100

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <HardDrive size={12} className="text-white/40 shrink-0" />
        <span className="text-[11px] font-semibold text-white/70">{drive}</span>
        <span className="text-[10px] text-white/30 ml-auto">{formatBytes(free)} free</span>
      </div>
      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${usedPct}%` }}
          transition={{ delay: index * 0.08 + 0.15, duration: 0.6, ease: 'easeOut' }}
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
      </div>
      <div className="flex justify-between mt-0.5 text-[9px] text-white/20 font-medium">
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(totalBytes)} total</span>
      </div>
    </motion.div>
  )
}
