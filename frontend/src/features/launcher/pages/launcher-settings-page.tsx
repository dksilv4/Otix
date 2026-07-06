import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'

function Toggle({ checked, onChange, label, description }: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-center justify-between py-4 px-5 rounded-xl bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.09] transition-colors group">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-xs text-white/50">{description}</span>
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

function SelectRow({ value, onChange, label, description, options }: {
  value: string
  onChange: (v: string) => void
  label: string
  description: string
  options: { value: string; label: string }[]
}) {
  return (
    <label className="flex items-center justify-between py-4 px-5 rounded-xl bg-white/[0.06] border border-white/[0.1] hover:bg-white/[0.09] transition-colors cursor-pointer group">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-xs text-white/50">{description}</span>
      </div>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-white/[0.12] border border-white/20 rounded-lg px-3 py-1.5 text-sm text-white outline-none cursor-pointer hover:border-white/30 transition-colors"
      >
        {options.map(o => (
          <option key={o.value} value={o.value} className="bg-[#1a1a22] text-white">{o.label}</option>
        ))}
      </select>
    </label>
  )
}

export function LauncherSettingsPage() {
  const navigate = useNavigate()
  const { settings, update } = useLauncherSettings()

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-8 pt-6 pb-4 shrink-0">
        <button
          onClick={() => navigate({ to: '/launcher/library', replace: true })}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] transition-all active:scale-95 cursor-pointer"
        >
          <ArrowLeft size={16} className="text-white/60" />
        </button>
        <h1 className="text-lg font-black tracking-tight text-white/90">Settings</h1>
      </div>

      {/* Settings */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        <div className="max-w-lg flex flex-col gap-3">
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-white/30 mb-1">General</div>

          <Toggle
            checked={settings.slideshowWhenInactive}
            onChange={v => update('slideshowWhenInactive', v)}
            label="Auto-slideshow when inactive"
            description="Automatically cycle through featured games and screenshots after a period of inactivity"
          />

          <Toggle
            checked={settings.backgroundTransitions}
            onChange={v => update('backgroundTransitions', v)}
            label="Background transitions"
            description="Switch background images based on hovered screenshots and featured games"
          />

          <SelectRow
            value={settings.defaultPage}
            onChange={v => update('defaultPage', v as 'library' | 'slide-picker')}
            label="Default landing page"
            description="Which page to open first when entering the launcher"
            options={[
              { value: 'library', label: 'Library' },
              { value: 'slide-picker', label: 'Slide Picker' },
            ]}
          />
        </div>
      </div>
    </div>
  )
}
