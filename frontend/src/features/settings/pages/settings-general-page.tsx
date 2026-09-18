import { useState, useEffect } from 'react'
import { DkDropdown, type DkDropdownOption } from '@ui/atoms/dropdown'
import { DkButton } from '@ui/atoms/button'
import { Trash2, CheckCircle2 } from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { isDesktop } from '@/lib/desktop/api'

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
  const [cleared, setCleared] = useState(false)
  const desktop = isDesktop()

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, defaultPage)
    } catch {}
  }, [defaultPage])

  const handleClearCache = () => {
    try {
      const preserveKeys = new Set([
        'otix:token',
        'otix:user',
        'otix-accent',
        'otix-accent-customs',
        'otix:default-landing-page',
        'otix:launcher-theme',
      ])
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && !preserveKeys.has(key) && !key.startsWith('otix:auth')) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
      setCleared(true)
      setTimeout(() => setCleared(false), 2500)
    } catch {}
  }

  return (
    <div id="general" className="space-y-5 scroll-mt-28">
      {/* Default Landing Page */}
      <SettingsCard>
        <SectionHeader
          title="Default Landing Page"
          description="Choose which view opens first whenever you launch Otix."
          action={
            <DkDropdown
              options={LANDING_PAGE_OPTIONS}
              value={defaultPage}
              onChange={(v) => setDefaultPage(v)}
              className="w-44"
            />
          }
        />
      </SettingsCard>

      {/* Cache & Local State */}
      <SettingsCard>
        <SectionHeader
          title="Application Cache"
          description="Clear temporary cached catalog queries, search filters, and volatile media states without logging out."
          action={
            <DkButton
              size="sm"
              variant="ghost"
              onClick={handleClearCache}
              className="hover:bg-white/10 text-xs font-semibold gap-2"
            >
              {cleared ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Cache Cleared</span>
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5 text-white/60" />
                  <span>Clear Cache</span>
                </>
              )}
            </DkButton>
          }
        />
      </SettingsCard>

      {/* About Otix */}
      <SettingsCard>
        <SectionHeader
          title="About Otix"
          description="Client environment and build information."
        />

        <div
          className="rounded-2xl p-4 sm:p-5 space-y-3"
          style={{ backgroundColor: 'var(--dk-surface-raised)' }}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="text-white/60">Platform Environment</span>
            <span className="font-semibold text-white">
              {desktop ? 'Otix Desktop App (Electron)' : 'Otix Web App'}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs pt-3">
            <span className="text-white/60">Version</span>
            <span className="font-mono text-white/80">0.0.1 (Release)</span>
          </div>
          <div className="flex items-center justify-between text-xs pt-3">
            <span className="text-white/60">Status</span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Operational
            </span>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
