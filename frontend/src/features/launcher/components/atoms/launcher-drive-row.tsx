/* ── DriveRow — single drive row with progress bar ── */

import { motion } from 'framer-motion'
import { HardDrive, Gamepad2, Disc } from 'lucide-react'
import { formatBytes, driveLetter } from '@/features/launcher/utils'

interface DriveInfo {
  drive: string
  total?: number
  used: number
  free: number
  hasGamePaths?: boolean
  hasIsoPaths?: boolean
}

export const DriveRow = ({ drive, total, used, free, hasGamePaths, hasIsoPaths, index = 0 }: DriveInfo & { index?: number }) => {
  const totalBytes = total || used + free
  const usedPct = (used / totalBytes) * 100

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <HardDrive size={12} className="text-muted-foreground shrink-0" />
        <span className="text-[11px] font-semibold text-foreground">{driveLetter(drive)}</span>
        {hasGamePaths && (
          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5" title="Game folders on this drive">
            <Gamepad2 size={9} />
          </span>
        )}
        {hasIsoPaths && (
          <span className="text-[9px] text-muted-foreground flex items-center gap-0.5" title="ISO folders on this drive">
            <Disc size={9} />
          </span>
        )}
        <span className="text-[10px] text-muted-foreground ml-auto">{formatBytes(free)} free</span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${usedPct}%` }}
          transition={{ delay: index * 0.08 + 0.15, duration: 0.6, ease: 'easeOut' }}
          style={{ backgroundColor: 'var(--color-primary)' }}
        />
      </div>
      <div className="flex justify-between mt-0.5 text-[9px] text-muted-foreground/60 font-medium">
        <span>{formatBytes(used)} used</span>
        <span>{formatBytes(totalBytes)} total</span>
      </div>
    </motion.div>
  )
};
