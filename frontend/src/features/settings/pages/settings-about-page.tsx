import { useState, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  Info,
  Sparkles,
  BookOpen,
  ScrollText,
  Wand2,
  ExternalLink,
  RefreshCw,
  Globe,
  ArrowRight,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { Logo } from '@ui/atoms/logo'
import WindowsLogo from '@/assets/platform-logos/windows.svg?react'
import MacLogo from '@/assets/platform-logos/mac.svg?react'
import LinuxLogo from '@/assets/platform-logos/linux.svg?react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { isDesktop } from '@/lib/desktop/api'
import { getDesktopPlatform } from '@/lib/desktop/platform'
import { useAppUpdater } from '@/features/updater'
import { SetupWizardModal } from '@/features/welcome'
import { openExternal } from '@/lib/utils/open-external'
import { router } from '@/lib/router'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import {
  OTIX_GITHUB_REPO_URL,
  OTIX_GITHUB_ISSUES_URL,
  getPlatformDisplayLabel,
  getRuntimeLabel,
} from '../utils/about'

export const SettingsAboutPage = () => {
  const [showSetupWizard, setShowSetupWizard] = useState(false)
  const desktop = isDesktop()
  const platformInfo = useMemo(() => getDesktopPlatform(), [])
  useSettingsHashScroll()

  const {
    currentVersion,
    isChecking: isUpdateChecking,
    openReleaseNotesModal,
    openUpdateModal,
    checkForUpdates,
  } = useAppUpdater()

  const handleOpenReleaseNotes = () => {
    if (openReleaseNotesModal) {
      openReleaseNotesModal()
    } else {
      void router.navigate({ to: '/settings/release-notes' })
    }
  }

  const handleOpenGitHub = () => {
    openExternal(OTIX_GITHUB_REPO_URL, { newTab: true })
  }

  const handleOpenIssues = () => {
    openExternal(OTIX_GITHUB_ISSUES_URL, { newTab: true })
  }

  return (
    <div id="settings-about-section" className="space-y-8">
      <Helmet>
        <title>About — Otix Settings</title>
        <meta
          name="description"
          content="About Otix, welcome guide, documentation, and system environment."
        />
      </Helmet>

      <SectionHeader
        variant="page"
        icon={Info}
        title="About"
        description="Ecosystem overview, documentation, getting started guides, and client details."
      />

      <div id="about" className="space-y-5 scroll-mt-28">
        {/* Brand & Overview Hero Card */}
        <SettingsCard>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl p-2.5 backdrop-blur-xl"
                style={{ backgroundColor: 'var(--dk-surface-raised)' }}
              >
                <Logo className="h-9 w-9 text-foreground" />
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <h2 className="text-xl font-bold tracking-tight text-foreground">
                    Otix
                  </h2>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                    v{currentVersion}
                  </span>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--dk-surface-ghost)] text-muted-foreground">
                    {getPlatformDisplayLabel(platformInfo)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Unified ecosystem for personal media streaming, game emulation, and native desktop library management.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <DkButton
                type="button"
                size="sm"
                variant="secondary"
                leftIcon={ScrollText}
                onClick={handleOpenReleaseNotes}
                className="rounded-xl px-3.5 text-xs font-semibold"
              >
                Release Notes
              </DkButton>

              {desktop && (
                <DkButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  leftIcon={RefreshCw}
                  loading={isUpdateChecking}
                  onClick={() => {
                    if (openUpdateModal) {
                      openUpdateModal()
                    } else {
                      void checkForUpdates()
                    }
                  }}
                  className="rounded-xl px-3 text-xs font-semibold"
                >
                  Check Updates
                </DkButton>
              )}

              <DkButton
                type="button"
                size="sm"
                variant="ghost"
                leftIcon={ExternalLink}
                onClick={handleOpenGitHub}
                className="rounded-xl px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                GitHub
              </DkButton>
            </div>
          </div>
        </SettingsCard>

        {/* Resources & Guides: Welcome Guide & Documentation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Welcome Guide Card */}
          <SettingsCard className="flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary"
                  style={{ backgroundColor: 'var(--dk-surface-raised)' }}
                >
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                    Welcome Guide
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Onboarding &amp; Walkthroughs
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Take an interactive tour of Otix features, learn controller mappings and key shortcuts,
                explore navigation tips, or re-run setup.
              </p>
            </div>

            <div className="pt-5 mt-4 border-t border-[var(--dk-separator)] flex flex-wrap items-center gap-2">
              <DkButton
                type="button"
                size="sm"
                variant="primary"
                leftIcon={Sparkles}
                rightIcon={ArrowRight}
                onClick={() => void router.navigate({ to: '/welcome' })}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Open Welcome Guide
              </DkButton>

              <DkButton
                type="button"
                size="sm"
                variant="secondary"
                leftIcon={Wand2}
                onClick={() => setShowSetupWizard(true)}
                className="rounded-xl px-3 text-xs font-semibold"
              >
                Setup Wizard
              </DkButton>
            </div>
          </SettingsCard>

          {/* Documentation Card */}
          <SettingsCard className="flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-primary"
                  style={{ backgroundColor: 'var(--dk-surface-raised)' }}
                >
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-foreground tracking-tight">
                    Documentation
                  </h3>
                  <span className="text-[11px] text-muted-foreground">
                    Manuals, Guides &amp; APIs
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Explore in-depth documentation covering BYOS streaming, remote node pairing,
                dedicated game servers, metadata matching, and architecture.
              </p>
            </div>

            <div className="pt-5 mt-4 border-t border-[var(--dk-separator)] flex flex-wrap items-center gap-2">
              <DkButton
                type="button"
                size="sm"
                variant="primary"
                leftIcon={BookOpen}
                rightIcon={ArrowRight}
                onClick={() => void router.navigate({ to: '/docs' })}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Explore Documentation
              </DkButton>

              <DkButton
                type="button"
                size="sm"
                variant="secondary"
                leftIcon={ScrollText}
                onClick={handleOpenReleaseNotes}
                className="rounded-xl px-3 text-xs font-semibold"
              >
                Changelog
              </DkButton>
            </div>
          </SettingsCard>
        </div>

        {/* Client & Environment Info */}
        <SettingsCard>
          <SectionHeader
            title="System & Environment"
            description="Active client runtime, platform capabilities, and build information."
          />

          <div
            className="rounded-2xl p-4 sm:p-5 space-y-4"
            style={{ backgroundColor: 'var(--dk-surface-raised)' }}
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Platform Environment</span>
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <span>Otix on {getPlatformDisplayLabel(platformInfo)}</span>
                {platformInfo.isWindows ? (
                  <WindowsLogo className="h-3.5 w-3.5 fill-current text-foreground" />
                ) : platformInfo.isMac ? (
                  <MacLogo className="h-3.5 w-3.5 fill-current text-foreground" />
                ) : platformInfo.isLinux ? (
                  <LinuxLogo className="h-3.5 w-3.5 fill-current text-foreground" />
                ) : (
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground">Installed Version</span>
              <span className="font-mono text-foreground font-semibold">
                v{currentVersion}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground">Runtime Mode</span>
              <span className="text-foreground font-medium">
                {getRuntimeLabel(desktop)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-muted-foreground">System Status</span>
              <span className="text-xs font-semibold text-primary">
                Operational
              </span>
            </div>

            <div className="mt-4 pt-4 border-t border-[var(--dk-separator)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-foreground">
                  Open Source &amp; Community
                </span>
                <p className="text-xs text-muted-foreground">
                  Otix is free, open source software licensed under the MIT License.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <DkButton
                  type="button"
                  size="sm"
                  variant="ghost"
                  leftIcon={ExternalLink}
                  onClick={handleOpenIssues}
                  className="rounded-xl px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Report Issue
                </DkButton>

                <DkButton
                  type="button"
                  size="sm"
                  variant="secondary"
                  leftIcon={ExternalLink}
                  onClick={handleOpenGitHub}
                  className="rounded-xl px-3.5 text-xs font-semibold"
                >
                  GitHub Repository
                </DkButton>
              </div>
            </div>
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
