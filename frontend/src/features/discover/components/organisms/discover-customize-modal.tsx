import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { ArrowUp, ArrowDown, RotateCcw, Check } from 'lucide-react'
import {
  type StoredSectionItem,
  type DiscoverPreset,
  PRESET_CONFIGS,
  getSectionMeta,
} from '../../utils/sections'

interface DiscoverCustomizeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sections: StoredSectionItem[]
  onToggleSection: (id: string) => void
  onMoveSection: (id: string, direction: 'up' | 'down') => void
  onApplyPreset: (preset: DiscoverPreset) => void
  onResetToDefault: () => void
}

export const DiscoverCustomizeModal = ({
  open,
  onOpenChange,
  sections,
  onToggleSection,
  onMoveSection,
  onApplyPreset,
  onResetToDefault,
}: DiscoverCustomizeModalProps) => {
  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Customize Discover Feed"
      description="Personalize your discovery experience. Toggle sections, change the display order, or choose a quick preset."
      className="max-w-2xl max-h-[85vh] flex flex-col"
    >
      <div className="flex flex-col gap-5 overflow-y-auto pr-1 py-1">
        {/* Presets bar */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Quick Layout Presets
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.entries(PRESET_CONFIGS) as [DiscoverPreset, (typeof PRESET_CONFIGS)[DiscoverPreset]][]).map(
              ([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onApplyPreset(key)}
                  className="flex flex-col items-start p-2.5 rounded-xl bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] border border-[var(--dk-separator)] transition-all text-left cursor-pointer"
                >
                  <span className="text-xs font-bold text-foreground">{preset.label}</span>
                  <span className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                    {preset.description}
                  </span>
                </button>
              ),
            )}
          </div>
        </div>

        {/* Section list with reorder and toggle */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Feed Sections & Order
          </span>
          <div className="space-y-2">
            {sections.map((section, idx) => {
              const meta = getSectionMeta(section.id)
              if (!meta) return null
              const isFirst = idx === 0
              const isLast = idx === sections.length - 1

              return (
                <div
                  key={section.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {/* Reorder up/down */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => onMoveSection(section.id, 'up')}
                        aria-label={`Move ${meta.label} up`}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => onMoveSection(section.id, 'down')}
                        aria-label={`Move ${meta.label} down`}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] disabled:opacity-20 disabled:pointer-events-none transition-all cursor-pointer"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {meta.label}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--dk-surface-raised)] text-muted-foreground capitalize">
                          {meta.category}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground line-clamp-1">
                        {meta.description}
                      </span>
                    </div>
                  </div>

                  <DkSwitch
                    checked={section.enabled}
                    onCheckedChange={() => onToggleSection(section.id)}
                    aria-label={`Toggle ${meta.label}`}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--dk-separator)]">
          <button
            type="button"
            onClick={onResetToDefault}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to Default
          </button>
          <DkButton
            variant="primary"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer gap-1.5"
          >
            <Check className="h-4 w-4" />
            Done
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
};
