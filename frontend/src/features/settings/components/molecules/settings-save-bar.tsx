import { cn } from '@/lib/utils'
import { DkButton } from '@/old-features/ui/atoms/button'
import { CheckCircle2 } from 'lucide-react'

interface SettingsSaveBarProps {
  hasChanges: boolean
  onSave: () => void
  saving?: boolean
  saved?: boolean
  label?: string
}

export function SettingsSaveBar({
  hasChanges,
  onSave,
  saving = false,
  saved = false,
  label = 'Save',
}: SettingsSaveBarProps) {
  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-out',
        hasChanges || saved
          ? 'translate-y-0 opacity-100'
          : 'translate-y-full opacity-0 pointer-events-none',
      )}
    >
      <div
        className="mx-auto max-w-7xl px-4 sm:px-6 pb-6"
      >
        <div
          className="flex items-center justify-between gap-4 rounded-2xl px-6 py-4 shadow-2xl"
          style={{
            backgroundColor: 'var(--dk-surface-base)',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {saved && (
                <CheckCircle2 className="h-5 w-5 text-green-400" />
              )}
              <p className="text-sm text-white/80">
                {saved
                  ? 'Changes saved'
                  : hasChanges
                    ? 'You have unsaved changes'
                    : null}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-green-400/60">Saved</span>
            )}
            <DkButton
              variant="primary"
              size="sm"
              onClick={onSave}
              loading={saving}
              disabled={!hasChanges}
              className="shadow-none"
            >
              {label}
            </DkButton>
          </div>
        </div>
      </div>
    </div>
  )
}
