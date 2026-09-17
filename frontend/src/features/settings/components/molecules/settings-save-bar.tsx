import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { DkButton } from '@ui/atoms/button'
import { CheckCircle2, AlertCircle, RotateCcw } from 'lucide-react'
import { useSettingsSaveContext } from '../../context/settings-save-context'

export function SettingsSaveBar() {
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
        className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl px-5 py-3.5 shadow-2xl backdrop-blur-2xl"
        style={{
          backgroundColor: 'oklch(from var(--dk-surface-base) l c h / 0.85)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          {saved ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
          )}
          <p className="text-sm font-medium text-white/90 truncate">
            {saved ? 'Changes saved successfully' : 'You have unsaved changes'}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasChanges && onDiscard && !saving && !saved && (
            <button
              type="button"
              onClick={onDiscard}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white/60 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
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
}
