import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Gamepad2,
  Clock,
  Gauge,
  Flame,
  ChevronDown,
  Server,
  Cpu,
  BarChart3,
  Copy,
  Check,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import type { NormalizedPlaySession } from '../../hooks/use-user-game-sessions'
import { fullDateTime, humanPlaytime } from '../../utils'

interface SessionDetailModalProps {
  session: NormalizedPlaySession
  open: boolean
  onOpenChange: (open: boolean) => void
}

export const SessionDetailModal = ({
  session,
  open,
  onOpenChange,
}: SessionDetailModalProps) => {
  const [showNerdStats, setShowNerdStats] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(session, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <DkDialog open={open} onOpenChange={onOpenChange} className="max-w-md">
      <div className="flex items-start gap-4 mb-5">
        {session.posterUrl ? (
          <div className="w-14 h-20 rounded-xl overflow-hidden bg-muted/40 border border-border/50 shrink-0">
            <img src={session.posterUrl} alt={session.gameTitle} className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-14 h-20 rounded-xl bg-muted/40 border border-border/50 flex items-center justify-center shrink-0">
            <Gamepad2 size={24} className="text-muted-foreground/40" />
          </div>
        )}

        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="text-base font-bold text-foreground leading-tight truncate">
            {session.gameTitle}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {fullDateTime(session.startTime)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="p-3 rounded-xl bg-secondary/30 border border-border/40">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
            <Gauge size={11} className="text-primary" /> Avg FPS
          </span>
          <p className="text-2xl font-black font-mono tabular-nums text-foreground">
            {session.avgFps ? Math.round(session.avgFps) : '—'}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-secondary/30 border border-border/40">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
            <Flame size={11} className="text-muted-foreground" /> 1% Low
          </span>
          <p className="text-2xl font-black font-mono tabular-nums text-foreground">
            {session.low1Percent ? Math.round(session.low1Percent) : '—'}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-secondary/30 border border-border/40">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1 mb-1">
            <Clock size={11} className="text-muted-foreground" /> Time
          </span>
          <p className="text-2xl font-black font-mono tabular-nums text-foreground">
            {humanPlaytime(session.durationSeconds)}
          </p>
        </div>
      </div>

      {(session.hardwareSummary || session.node?.name) && (
        <div className="p-3 rounded-xl bg-secondary/20 border border-border/40 mb-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Cpu size={14} className="text-muted-foreground/60 shrink-0" />
            <span className="font-mono truncate">
              {session.hardwareSummary || (session.node?.name ? `Node: ${session.node.name}` : 'Desktop')}
            </span>
          </div>
          {session.node?.name && (
            <div className="mt-1 flex items-center gap-2 text-muted-foreground/70 font-mono text-[11px]">
              <Server size={12} className="text-muted-foreground/50 shrink-0" />
              <span>Node: {session.node.name}</span>
            </div>
          )}
        </div>
      )}

      <div className="border border-border/40 rounded-xl overflow-hidden bg-secondary/10">
        <button
          type="button"
          data-testid="analytics-for-nerds-toggle"
          onClick={() => setShowNerdStats(!showNerdStats)}
          className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <BarChart3 size={14} />
            <span>Analytics for Nerds</span>
          </div>
          <ChevronDown size={14} className={`transition-transform duration-200 ${showNerdStats ? 'rotate-180' : ''}`} />
        </button>

        <AnimatePresence>
          {showNerdStats && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-border/40 p-3.5 space-y-2 font-mono text-xs"
              data-testid="nerd-stats-panel"
            >
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                {session.minFps != null && session.maxFps != null && (
                  <div className="flex justify-between border-b border-border/30 pb-1">
                    <span className="text-muted-foreground/70">FPS Spread</span>
                    <span className="text-foreground font-bold">{Math.round(session.minFps)} – {Math.round(session.maxFps)}</span>
                  </div>
                )}
                {session.low01Percent != null && (
                  <div className="flex justify-between border-b border-border/30 pb-1">
                    <span className="text-muted-foreground/70">0.1% Low</span>
                    <span className="text-foreground font-bold">{Math.round(session.low01Percent)} FPS</span>
                  </div>
                )}
                {session.totalFrames != null && (
                  <div className="flex justify-between border-b border-border/30 pb-1">
                    <span className="text-muted-foreground/70">Total Frames</span>
                    <span className="text-foreground font-bold">{session.totalFrames.toLocaleString()}</span>
                  </div>
                )}
                {session.loadingSeconds != null && session.loadingSeconds > 0 && (
                  <div className="flex justify-between border-b border-border/30 pb-1">
                    <span className="text-muted-foreground/70">Loading Time</span>
                    <span className="text-foreground font-bold">{session.loadingSeconds}s</span>
                  </div>
                )}
                {session.backgroundSeconds != null && session.backgroundSeconds > 0 && (
                  <div className="flex justify-between border-b border-border/30 pb-1">
                    <span className="text-muted-foreground/70">Background Idle</span>
                    <span className="text-foreground font-bold">{session.backgroundSeconds}s</span>
                  </div>
                )}
                {session.processName && (
                  <div className="flex justify-between border-b border-border/30 pb-1 col-span-2">
                    <span className="text-muted-foreground/70">Process</span>
                    <span className="text-muted-foreground font-mono text-[10px] truncate max-w-[280px]">{session.processName}</span>
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-secondary/50 hover:bg-secondary text-muted-foreground hover:text-foreground text-[10px] cursor-pointer transition-colors"
                >
                  {copied ? <Check size={12} className="text-primary" /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DkDialog>
  )
};
