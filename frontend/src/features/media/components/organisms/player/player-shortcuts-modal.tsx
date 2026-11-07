import { Keyboard, X } from 'lucide-react'

export interface PlayerShortcutsModalProps {
  isOpen: boolean
  isTrailer: boolean
  onClose: () => void
}

export const PlayerShortcutsModal = ({
  isOpen,
  isTrailer,
  onClose,
}: PlayerShortcutsModalProps) => {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md border-0"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-[var(--dk-surface-glass)] backdrop-blur-2xl p-6 shadow-2xl flex flex-col gap-4 border-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-primary-foreground flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-primary" />
            Keyboard Shortcuts
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary-foreground hover:bg-white/10 transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
            <span className="text-foreground">Play / Pause</span>
            <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">Space / K</kbd>
          </div>
          <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
            <span className="text-foreground">Mute / Unmute</span>
            <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">M</kbd>
          </div>
          <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
            <span className="text-foreground">Seek ±10s</span>
            <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">← / →</kbd>
          </div>
          <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
            <span className="text-foreground">Theater Mode</span>
            <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">T</kbd>
          </div>
          <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
            <span className="text-foreground">Fullscreen</span>
            <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">F</kbd>
          </div>
          {isTrailer && (
            <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
              <span className="text-foreground">Zoom In / Out</span>
              <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">Z</kbd>
            </div>
          )}
          {!isTrailer && (
            <>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
                <span className="text-foreground">In-App PiP</span>
                <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">I</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
                <span className="text-foreground">Picture-in-Picture (OS)</span>
                <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">P</kbd>
              </div>
              <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--dk-surface-glass)]">
                <span className="text-foreground">Quality</span>
                <kbd className="px-2 py-0.5 rounded bg-white/10 font-mono font-bold text-[11px]">Q</kbd>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
