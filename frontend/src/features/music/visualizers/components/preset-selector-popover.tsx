import { motion, AnimatePresence } from 'framer-motion'
import { Check, Sparkles, X } from 'lucide-react'
import type { VisualizerMode, VisualizerModeOption } from '../types'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'
import { VISUALIZER_MODES, getVisualizerModeIcon } from '../utils/visualizer-helpers'
import { cn } from '@/lib/utils'

export interface PresetSelectorPopoverProps {
  isOpen: boolean
  onClose: () => void
  currentMode: VisualizerMode
  onSelectMode: (mode: VisualizerMode) => void
  theme?: MusicPlayerTheme
}

export const PresetSelectorPopover = ({
  isOpen,
  onClose,
  currentMode,
  onSelectMode,
  theme,
}: PresetSelectorPopoverProps) => {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      {/* Invisible backdrop to dismiss on click outside */}
      <div
        className="fixed inset-0 z-30 pointer-events-auto"
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="preset-selector-popover"
        initial={{ opacity: 0, y: -10, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.96 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="absolute top-full mt-2 left-0 sm:left-6 z-40 w-[calc(100vw-2rem)] sm:w-[420px] max-h-[500px] rounded-2xl backdrop-blur-2xl p-4 flex flex-col shadow-2xl select-none"
        style={{
          background: theme?.podBackground || 'var(--dk-surface-glass)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-semibold text-foreground">Visualizer Presets</h3>
            <span className="text-[11px] font-mono text-muted-foreground px-2 py-0.5 rounded-full bg-[var(--dk-surface-raised)]">
              {VISUALIZER_MODES.length} Available
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
            title="Close"
            aria-label="Close presets"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Preset List */}
        <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1 max-h-[400px]">
          {VISUALIZER_MODES.map((option: VisualizerModeOption) => {
            const IconComponent = getVisualizerModeIcon(option.iconName)
            const isSelected = option.id === currentMode

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  onSelectMode(option.id)
                  onClose()
                }}
                className={cn(
                  'w-full text-left p-2.5 rounded-xl transition-all flex items-start gap-3 group relative',
                  isSelected
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                )}
              >
                <div
                  className={cn(
                    'mt-0.5 p-2 rounded-lg transition-colors flex items-center justify-center',
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-[var(--dk-surface-raised)] text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  <IconComponent className="h-4 w-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'text-xs font-semibold truncate',
                        isSelected ? 'text-primary' : 'text-foreground',
                      )}
                    >
                      {option.name}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-mono font-medium px-1.5 py-0.5 rounded',
                        option.dimension === '3D'
                          ? 'bg-primary/10 text-primary'
                          : 'bg-[var(--dk-surface-raised)] text-muted-foreground',
                      )}
                    >
                      {option.dimension}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                    {option.description}
                  </p>
                </div>

                {isSelected && (
                  <div className="self-center">
                    <div className="h-5 w-5 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                      <Check className="h-3 w-3 stroke-[2.5]" />
                    </div>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
