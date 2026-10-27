import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { SettingsAboutPage } from '../pages/settings-about-page'
import * as updaterModule from '@/features/updater'
import * as openExternalModule from '@/lib/utils/open-external'
import { router } from '@/lib/router'

vi.mock('@/lib/desktop/api', () => ({
  isDesktop: vi.fn().mockReturnValue(true),
  getDesktopAPI: vi.fn().mockReturnValue(null),
}))

vi.mock('../hooks/use-settings-hash-scroll', () => ({
  useSettingsHashScroll: vi.fn(),
}))

vi.mock('@/lib/router', () => ({
  router: {
    navigate: vi.fn(),
  },
}))

vi.mock('@/features/welcome', () => ({
  SetupWizardModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="setup-wizard-modal">Setup Wizard Modal</div> : null,
}))

describe('SettingsAboutPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const renderComponent = () =>
    render(
      <HelmetProvider>
        <SettingsAboutPage />
      </HelmetProvider>,
    )

  it('renders branding, installed version, and system environment', () => {
    vi.spyOn(updaterModule, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.38',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: true,
      isDismissed: false,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
    })

    renderComponent()

    expect(screen.getByRole('heading', { level: 3, name: 'About' })).toBeDefined()
    expect(screen.getAllByText('Otix').length).toBeGreaterThan(0)
    expect(screen.getAllByText('v0.1.38').length).toBeGreaterThan(0)
    expect(screen.getByText('Operational')).toBeDefined()
    expect(screen.getByText('System & Environment')).toBeDefined()
  })

  it('renders Welcome Guide card and navigates on click', () => {
    vi.spyOn(updaterModule, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.38',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: true,
      isDismissed: false,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
    })

    renderComponent()

    expect(screen.getByRole('heading', { level: 3, name: 'Welcome Guide' })).toBeDefined()
    const openWelcomeBtn = screen.getByRole('button', { name: /open welcome guide/i })
    expect(openWelcomeBtn).toBeDefined()

    fireEvent.click(openWelcomeBtn)
    expect(router.navigate).toHaveBeenCalledWith({ to: '/welcome' })
  })

  it('renders Documentation card and navigates on click', () => {
    vi.spyOn(updaterModule, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.38',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: true,
      isDismissed: false,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
    })

    renderComponent()

    expect(screen.getByRole('heading', { level: 3, name: 'Documentation' })).toBeDefined()
    const exploreDocsBtn = screen.getByRole('button', { name: /explore documentation/i })
    expect(exploreDocsBtn).toBeDefined()

    fireEvent.click(exploreDocsBtn)
    expect(router.navigate).toHaveBeenCalledWith({ to: '/docs' })
  })

  it('opens Release Notes modal when Release Notes button is clicked', () => {
    const openNotesMock = vi.fn()
    vi.spyOn(updaterModule, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.38',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: true,
      isDismissed: false,
      openReleaseNotesModal: openNotesMock,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
    })

    renderComponent()

    const releaseNotesBtn = screen.getAllByRole('button', { name: /release notes/i })[0]
    fireEvent.click(releaseNotesBtn)
    expect(openNotesMock).toHaveBeenCalled()
  })

  it('opens external GitHub repository on button click', () => {
    const openExtSpy = vi.spyOn(openExternalModule, 'openExternal').mockImplementation(() => {})
    vi.spyOn(updaterModule, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.38',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: true,
      isDismissed: false,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
    })

    renderComponent()

    const githubBtn = screen.getByRole('button', { name: /github repository/i })
    fireEvent.click(githubBtn)
    expect(openExtSpy).toHaveBeenCalledWith('https://github.com/dksilv4/Otix', { newTab: true })
  })

  it('opens Setup Wizard modal when Setup Wizard button is clicked', () => {
    vi.spyOn(updaterModule, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.38',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: true,
      isDismissed: false,
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
    })

    renderComponent()

    expect(screen.queryByTestId('setup-wizard-modal')).toBeNull()
    const wizardBtn = screen.getByRole('button', { name: /setup wizard/i })
    fireEvent.click(wizardBtn)
    expect(screen.getByTestId('setup-wizard-modal')).toBeDefined()
  })
})
