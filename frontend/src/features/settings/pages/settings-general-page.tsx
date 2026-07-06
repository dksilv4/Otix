import { useState, useEffect } from 'react'
import { DkDropdown, type DkDropdownOption } from '@/old-features/ui/atoms/dropdown'
import { SectionHeader } from '../components/molecules/settings-section-header'

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, defaultPage)
  }, [defaultPage])

  return (
    <div id="settings-general-section" className="space-y-6">
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Default Landing Page"
          description="Choose which page opens first when you visit Otix."
        />

        <div className="flex items-center justify-between rounded-xl px-4 py-4" style={{ backgroundColor: 'var(--dk-surface-raised)' }}>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium">Landing page</span>
            <span className="text-xs text-white/60">The first page you see when opening the app</span>
          </div>
          <DkDropdown
            options={LANDING_PAGE_OPTIONS}
            value={defaultPage}
            onChange={v => setDefaultPage(v)}
            className="w-44"
          />
        </div>
      </div>
    </div>
  )
}
