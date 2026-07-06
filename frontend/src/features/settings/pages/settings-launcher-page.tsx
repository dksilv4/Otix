import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import { DkDropdown, type DkDropdownOption } from '@/old-features/ui/atoms/dropdown'
import { SectionHeader } from '../components/molecules/settings-section-header'

function Toggle({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-center justify-between rounded-xl px-4 py-4" style={{ backgroundColor: 'var(--dk-surface-raised)' }}>
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-white/60">{description}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${checked ? 'bg-[oklch(0.705_0.213_47.604)]' : 'bg-white/20'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
      </button>
    </div>
  )
}

export function SettingsLauncherPage() {
  const { settings, update } = useLauncherSettings()

  return (
    <div id="settings-launcher-section" className="space-y-6">
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Slideshow"
          description="Control auto-cycling behavior when you're inactive."
        />

        <div className="space-y-2">
          <Toggle
            checked={settings.slideshowWhenInactive}
            onChange={v => update('slideshowWhenInactive', v)}
            label="Auto-slideshow when inactive"
            description="Automatically cycle through featured games and screenshots after a period of inactivity"
          />
        </div>
      </div>

      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Background"
          description="Control background image transitions."
        />

        <div className="space-y-2">
          <Toggle
            checked={settings.backgroundTransitions}
            onChange={v => update('backgroundTransitions', v)}
            label="Background transitions"
            description="Switch background images based on hovered screenshots and featured games"
          />
        </div>
      </div>

      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Default Page"
          description="Which page to open first when entering the launcher."
        />

        <div className="flex items-center justify-between rounded-xl px-4 py-4" style={{ backgroundColor: 'var(--dk-surface-raised)' }}>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Landing page</span>
            <span className="text-xs text-white/60">Choose your default launcher view</span>
          </div>
          <DkDropdown
            options={[
              { value: 'library', label: 'Library' },
              { value: 'slide-picker', label: 'Slide Picker' },
            ] satisfies readonly DkDropdownOption[]}
            value={settings.defaultPage}
            onChange={v => update('defaultPage', v as 'library' | 'slide-picker')}
            className="w-44"
          />
        </div>
      </div>
    </div>
  )
}
