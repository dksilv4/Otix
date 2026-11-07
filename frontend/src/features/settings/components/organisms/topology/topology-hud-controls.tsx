import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import type { NodeMapItem } from '../../../types/node-map'
import type { NodesCentralHubStats } from '../nodes-central-hub-node'

export interface TopologyHudControlsProps {
  hubStats?: NodesCentralHubStats
  viewport: { zoom: number }
  connectingFrom: NodeMapItem | null
  onCancelConnecting: () => void
  onAutoLayout: () => void
  onFitView: () => void
  onResetView: () => void
  onZoomIn: () => void
  onZoomOut: () => void
}

export const TopologyHudControls = ({
  hubStats,
  viewport,
  connectingFrom,
  onCancelConnecting,
  onAutoLayout,
  onFitView,
  onResetView,
  onZoomIn,
  onZoomOut,
}: TopologyHudControlsProps) => {
  return (
    <>
      {/* Connecting Mode Banner */}
      {connectingFrom && (
        <div className="absolute top-44 left-1/2 -translate-x-1/2 z-30 pointer-events-auto p-3 rounded-2xl bg-primary/15 border border-primary/20 backdrop-blur-2xl flex items-center justify-between gap-3 text-xs shadow-xl animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">
              Connecting from &quot;{connectingFrom.name}&quot;
            </span>
            <span className="text-muted-foreground hidden sm:inline">
              — Click on a node to connect, or right-click / Esc to cancel.
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelConnecting}
            className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-lg bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-hover)] border border-[var(--dk-separator)] text-foreground transition-colors cursor-pointer"
          >
            <X size={12} />
            <span>Cancel</span>
          </button>
        </div>
      )}

      {/* Floating Topology Map Status HUD */}
      <div
        className="absolute top-4 sm:top-6 right-4 sm:right-6 z-20 pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-[var(--dk-surface-overlay)] backdrop-blur-2xl border border-white/[0.06] shadow-xl text-xs select-none"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            hubStats?.offlineNodes === 0 ? 'bg-status-online animate-pulse' : 'bg-status-warning',
          )}
        />
        <span className="font-mono font-semibold text-foreground">
          {hubStats ? `${hubStats.onlineNodes}/${hubStats.totalNodes}` : '0/0'} online
        </span>
      </div>

      {/* Floating HUD in bottom-right corner for Canvas Navigation Controls */}
      <div
        className="absolute bottom-6 right-6 z-20 pointer-events-auto flex items-center gap-1 p-1.5 rounded-2xl bg-[var(--dk-surface-overlay)] backdrop-blur-2xl border border-[var(--dk-separator)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <DkButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={onAutoLayout}
          title="Auto arrange layout"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw size={13} />
        </DkButton>

        <DkButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={onFitView}
          title="Fit to screen"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <Maximize2 size={13} />
        </DkButton>

        <div className="h-3.5 w-px bg-[var(--dk-separator)] mx-0.5" />

        <DkButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={onZoomOut}
          title="Zoom out"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <ZoomOut size={13} />
        </DkButton>

        <button
          type="button"
          onClick={onResetView}
          title="Reset zoom to 100%"
          className="text-[11px] font-mono text-muted-foreground hover:text-foreground min-w-[36px] text-center select-none cursor-pointer"
        >
          {Math.round(viewport.zoom * 100)}%
        </button>

        <DkButton
          type="button"
          size="sm"
          variant="ghost"
          onClick={onZoomIn}
          title="Zoom in"
          className="h-7 px-2 text-muted-foreground hover:text-foreground"
        >
          <ZoomIn size={13} />
        </DkButton>
      </div>
    </>
  )
}
