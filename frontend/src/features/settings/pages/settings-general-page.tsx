import { useState, useEffect } from 'react'
import { DkDropdown } from '@ui/atoms/dropdown'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import {
  Trash2,
  CheckCircle2,
  Sparkles,
  Wand2,
  SlidersHorizontal,
  RefreshCw,
  DownloadCloud,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { isDesktop } from '@/lib/desktop/api'
import {
  useAppUpdater,
  getUpdateStatusLabel,
  formatBytes,
  formatSpeed,
} from '@/features/updater'
import { useWelcomePreferences, SetupWizardModal } from '@/features/welcome'
import { router } from '@/lib/router'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import {
  DEFAULT_LANDING_PAGE_KEY as STORAGE_KEY,
  LANDING_PAGE_OPTIONS,
  readDefaultPage,
} from '../utils/general'

export const SettingsGeneralPage = () => {
  const [defaultPage, setDefaultPage] = useState(readDefaultPage)
  const [cleared, setCleared] = useState(false)
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const desktop = isDesktop()
  useSettingsHashScroll()
  const {
    isWelcomeNavVisible,
    isWelcomeBannerVisible,
    setWelcomeNavVisible,
    setWelcomeBannerVisible,
  } = useWelcomePreferences()

  const {
    status: updateStatus,
    currentVersion,
    availableVersion,
    releaseNotes,
    progress: updateProgress,
    error: updateError,
    isChecking: isUpdateChecking,
    isDownloading: isUpdateDownloading,
    isDownloaded: isUpdateDownloaded,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useAppUpdater()

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, defaultPage)
    } catch {
      // ignore
    }
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
    } catch {
      // ignore
    }
  }

  return (
    <div id="settings-general-section" className="space-y-8">
      <SectionHeader
        variant="page"
        icon={SlidersHorizontal}
        title="General"
        description="Application defaults, startup view, welcome guides, and local cache."
      />

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

        {/* Welcome & Feature Guide */}
        <SettingsCard>
          <SectionHeader
            title="Welcome & Feature Guide"
            description="Manage getting started guides, walkthroughs, and navigation shortcuts."
          />

          <div className="space-y-4">
            <div
              className="flex items-center justify-between rounded-2xl p-4 sm:p-5"
              style={{ backgroundColor: 'var(--dk-surface-raised)' }}
            >
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-semibold text-foreground">Show in Navigation Menu</span>
                <p className="text-xs text-muted-foreground">
                  Display the Welcome Guide link in the floating navigation menu dropdown.
                </p>
              </div>
              <DkSwitch
                checked={isWelcomeNavVisible}
                onCheckedChange={setWelcomeNavVisible}
              />
            </div>

            <div
              className="flex items-center justify-between rounded-2xl p-4 sm:p-5"
              style={{ backgroundColor: 'var(--dk-surface-raised)' }}
            >
              <div className="space-y-0.5 pr-4">
                <span className="text-sm font-semibold text-foreground">Discover Greeting Banner</span>
                <p className="text-xs text-muted-foreground">
                  Display the introductory welcome card above the feed on Discover.
                </p>
              </div>
              <DkSwitch
                checked={isWelcomeBannerVisible}
                onCheckedChange={setWelcomeBannerVisible}
              />
            </div>

            <div className="pt-2 flex flex-wrap gap-2.5 justify-start">
              <DkButton
                variant="primary"
                size="sm"
                leftIcon={Wand2}
                onClick={() => setShowSetupWizard(true)}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Run Setup Wizard
              </DkButton>

              <DkButton
                variant="secondary"
                size="sm"
                leftIcon={Sparkles}
                onClick={() => router.navigate({ to: '/welcome' })}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Open Welcome Guide
              </DkButton>
            </div>
          </div>
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
                className="hover:bg-[var(--dk-surface-hover)] text-xs font-semibold gap-2"
              >
                {cleared ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                    <span className="text-primary font-medium">Cache Cleared</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Clear Cache</span>
                  </>
                )}
              </DkButton>
            }
          />
        </SettingsCard>

        {/* About & Updates */}
        <SettingsCard>
          <SectionHeader
            title="About & Updates"
            description="Client environment, build information, and application updates."
          />

          <div
            className="rounded-2xl p-4 sm:p-5 space-y-4"
            style={{ backgroundColor: 'var(--dk-surface-raised)' }}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Platform Environment</span>
              <span className="font-semibold text-foreground">
                {desktop ? 'Otix Desktop App (Electron)' : 'Otix Web App'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground">Installed Version</span>
              <span className="font-mono text-foreground font-semibold">
                v{currentVersion}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground">System Status</span>
              <span className="text-xs font-semibold text-primary">
                Operational
              </span>
            </div>

            {desktop && (
              <div className="mt-4 pt-4 border-t border-[var(--dk-separator)] space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      Application Updates
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {getUpdateStatusLabel(updateStatus, availableVersion ?? undefined)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isUpdateDownloaded ? (
                      <DkButton
                        size="sm"
                        variant="primary"
                        rightIcon={ArrowRight}
                        onClick={() => void installUpdate()}
                        className="rounded-xl px-4 text-xs font-semibold"
                      >
                        Restart & Install
                      </DkButton>
                    ) : updateStatus === 'available' ? (
                      <DkButton
                        size="sm"
                        variant="primary"
                        leftIcon={DownloadCloud}
                        onClick={() => void downloadUpdate()}
                        className="rounded-xl px-4 text-xs font-semibold"
                      >
                        Download Update
                      </DkButton>
                    ) : (
                      <DkButton
                        size="sm"
                        variant="secondary"
                        leftIcon={RefreshCw}
                        loading={isUpdateChecking || isUpdateDownloading}
                        loadingText={isUpdateDownloading ? 'Downloading...' : 'Checking...'}
                        onClick={() => void checkForUpdates()}
                        className="rounded-xl px-4 text-xs font-semibold"
                      >
                        Check for Updates
                      </DkButton>
                    )}
                  </div>
                </div>

                {isUpdateDownloading && updateProgress && (
                  <div className="space-y-1.5 pt-1">
                    <div className="w-full bg-[var(--dk-surface-ghost)] rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-primary h-full transition-all duration-300 rounded-full"
                        style={{ width: `${Math.min(100, Math.max(0, updateProgress.percent))}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                      <span>{updateProgress.percent.toFixed(1)}%</span>
                      <span>
                        {formatBytes(updateProgress.transferred)} of {formatBytes(updateProgress.total)} ({formatSpeed(updateProgress.bytesPerSecond)})
                      </span>
                    </div>
                  </div>
                )}

                {updateError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl text-xs text-destructive bg-[var(--dk-surface-ghost)]">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">{updateError}</span>
                  </div>
                )}

                {releaseNotes && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Release Notes
                    </span>
                    <div className="p-3 rounded-xl bg-[var(--dk-surface-base)] text-xs text-muted-foreground whitespace-pre-wrap max-h-36 overflow-y-auto">
                      {releaseNotes}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </SettingsCard>
      </div>

      {showSetupWizard && (
        <SetupWizardModal
          isOpen={showSetupWizard}
          onClose={() => setShowSetupWizard(false)}
        />
      )}
    </div>
  )
};
