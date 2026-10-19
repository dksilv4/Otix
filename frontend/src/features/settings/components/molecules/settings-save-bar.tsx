import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { DkButton } from '@ui/atoms/button'
import { CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import { useSettingsSaveContext } from '../../context/settings-save-context'

export const SettingsSaveBar = () => {
  const { config } = useSettingsSaveContext()
  const [autoSavedVisible, setAutoSavedVisible] = useState(false)

  const hasChanges = config?.hasChanges ?? false
  const saving = config?.saving ?? false
  const saved = config?.saved ?? false
  const label = config?.label ?? 'Save Changes'
  const onSave = config?.onSave
  const onDiscard = config?.onDiscard

  // Auto-dismiss the save bar 2.5 seconds after saving completes
  useEffect(() => {
    if (saved) {
      setAutoSavedVisible(true)
      const timer = setTimeout(() => {
        setAutoSavedVisible(false)
      }, 2500)
      return () => clearTimeout(timer)
    } else {
      setAutoSavedVisible(false)
    }
  }, [saved])

  const visible = hasChanges || autoSavedVisible

  return (
    <div
      className={cn(
        'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ease-out w-full max-w-xl px-4 pointer-events-none',
        visible
          ? 'translate-y-0 opacity-100'
          : 'translate-y-10 opacity-0',
      )}
    >
      <div
        className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 shadow-xl backdrop-blur-2xl bg-[var(--dk-surface-overlay)]"
      >
        <div className="flex items-center gap-3 min-w-0">
          {saved ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0" />
          )}
          <p className="text-sm font-medium text-foreground truncate">
            {saved ? 'Changes saved successfully' : 'You have unsaved changes'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasChanges && onDiscard && !saving && !saved && (
            <button
              type="button"
              onClick={onDiscard}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-xl hover:bg-[var(--dk-surface-hover)] transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}

          <DkButton
            variant="primary"
            size="sm"
            onClick={onSave}
            loading={saving}
            disabled={!hasChanges || saving}
            className="shadow-md"
          >
            {label}
          </DkButton>
        </div>
      </div>
    </div>
  )
};
