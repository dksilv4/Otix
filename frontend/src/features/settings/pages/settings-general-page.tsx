import { useState, useEffect } from 'react'
import { DkDropdown, type DkDropdownOption } from '@/old-features/ui/atoms/dropdown'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'

const STORAGE_KEY = 'otix:default-landing-page'

const LANDING_PAGE_OPTIONS = [
  { value: 'discover', label: 'Discover' },
  { value: 'launcher', label: 'Launcher' },
  { value: 'library', label: 'Library' },
] satisfies readonly DkDropdownOption[]

function readDefaultPage(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'discover'
  } catch {
    return 'discover'
  }
}

export function SettingsGeneralPage() {
  const [defaultPage, setDefaultPage] = useState(readDefaultPage)
  const { settings, update } = useLauncherSettings()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, defaultPage)
  }, [defaultPage])

  return (
    <div id="settings-general-section" className="space-y-5">
      {/* Default Landing Page */}
      <SettingsCard>
        <SectionHeader
          title="Default Landing Page"
          description="Choose which page opens first when you launch Otix."
          action={
            <DkDropdown
              options={LANDING_PAGE_OPTIONS}
              value={defaultPage}
              onChange={v => setDefaultPage(v)}
              className="w-44"
            />
          }
        />
      </SettingsCard>

      {/* Background Transitions */}
      <SettingsCard>
        <SectionHeader
          title="Background transitions"
          description="Switch background images based on hovered screenshots and featured games."
          action={
            <DkSwitch
              checked={settings.backgroundTransitions}
              onCheckedChange={v => update('backgroundTransitions', v)}
            />
          }
        />
      </SettingsCard>

      {/* Default Launcher View */}
      <SettingsCard>
        <SectionHeader
          title="Default Launcher View"
          description="Choose which view to display when entering the launcher."
          action={
            <DkDropdown
              options={[
                { value: 'library', label: 'Library' },
                { value: 'slide-picker', label: 'Slide Picker' },
              ] satisfies readonly DkDropdownOption[]}
              value={settings.defaultPage}
              onChange={v => update('defaultPage', v as 'library' | 'slide-picker')}
              className="w-44"
            />
          }
        />
      </SettingsCard>
    </div>
  )
}
