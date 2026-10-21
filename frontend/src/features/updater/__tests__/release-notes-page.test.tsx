import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { ReleaseNotesPage } from '../pages/release-notes-page'
import * as updaterHook from '../hooks/use-app-updater'
import * as updaterUtils from '../utils/updater-utils'
import * as openExternalModule from '@/lib/utils/open-external'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}))

describe('ReleaseNotesPage', () => {
  const openExternalSpy = vi.spyOn(openExternalModule, 'openExternal').mockImplementation(() => {})

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders breadcrumbs, title, version, and formatted markdown notes', () => {
    vi.spyOn(updaterHook, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.24',
      availableVersion: '0.1.25',
      releaseNotes: '## What Changed\n* feat(web): release notes page on web',
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: true,
      isDesktop: false,
      isDismissed: false,
      isModalOpen: false,
      isReleaseNotesOpen: false,
      autoCheck: true,
      autoDownload: true,
      allowPrerelease: false,
      githubToken: '',
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      openReleaseNotesModal: vi.fn(),
      closeReleaseNotesModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
      setAllowPrerelease: vi.fn(),
      setGithubToken: vi.fn(),
      validateToken: vi.fn(),
    })

    render(
      <HelmetProvider>
        <ReleaseNotesPage />
      </HelmetProvider>
    )

    expect(screen.getByRole('heading', { level: 1, name: /release notes/i })).toBeInTheDocument()
    expect(screen.getByText('v0.1.25')).toBeInTheDocument()
    expect(screen.getByText(/what changed/i)).toBeInTheDocument()
    expect(screen.getByText(/release notes page on web/i)).toBeInTheDocument()
  })

  it('triggers openReleaseNotesModal when Open in Modal button is clicked', () => {
    const openModalMock = vi.fn()
    vi.spyOn(updaterHook, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.24',
      availableVersion: null,
      releaseNotes: 'Notes for testing modal opening',
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: false,
      isDismissed: false,
      isModalOpen: false,
      isReleaseNotesOpen: false,
      autoCheck: true,
      autoDownload: true,
      allowPrerelease: false,
      githubToken: '',
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      openReleaseNotesModal: openModalMock,
      closeReleaseNotesModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
      setAllowPrerelease: vi.fn(),
      setGithubToken: vi.fn(),
      validateToken: vi.fn(),
    })

    render(
      <HelmetProvider>
        <ReleaseNotesPage />
      </HelmetProvider>
    )

    const modalBtn = screen.getByRole('button', { name: /open in modal/i })
    fireEvent.click(modalBtn)
    expect(openModalMock).toHaveBeenCalledTimes(1)
  })

  it('opens GitHub releases when GitHub Releases button is clicked', () => {
    vi.spyOn(updaterHook, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.24',
      availableVersion: '0.1.24',
      releaseNotes: 'Notes',
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: false,
      isDismissed: false,
      isModalOpen: false,
      isReleaseNotesOpen: false,
      autoCheck: true,
      autoDownload: true,
      allowPrerelease: false,
      githubToken: '',
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      openReleaseNotesModal: vi.fn(),
      closeReleaseNotesModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
      setAllowPrerelease: vi.fn(),
      setGithubToken: vi.fn(),
      validateToken: vi.fn(),
    })

    render(
      <HelmetProvider>
        <ReleaseNotesPage />
      </HelmetProvider>
    )

    const ghBtn = screen.getByRole('button', { name: /github releases/i })
    fireEvent.click(ghBtn)
    expect(openExternalSpy).toHaveBeenCalledWith(
      'https://github.com/dksilv4/Otix/releases/tag/v0.1.24',
      { newTab: true }
    )
  })

  it('fetches release notes if not already loaded in state', async () => {
    vi.spyOn(updaterUtils, 'fetchLatestReleaseNotes').mockResolvedValue({
      version: '0.1.27',
      notes: '## Remote Web Notes\n* Live web changelog item',
      publishedAt: '2026-10-21T18:00:00Z',
    })

    vi.spyOn(updaterHook, 'useAppUpdater').mockReturnValue({
      status: 'idle',
      currentVersion: '0.1.24',
      availableVersion: null,
      releaseNotes: null,
      progress: null,
      error: null,
      isChecking: false,
      isDownloading: false,
      isDownloaded: false,
      isUpdateAvailable: false,
      isDesktop: false,
      isDismissed: false,
      isModalOpen: false,
      isReleaseNotesOpen: false,
      autoCheck: true,
      autoDownload: true,
      allowPrerelease: false,
      githubToken: '',
      checkForUpdates: vi.fn(),
      downloadUpdate: vi.fn(),
      installUpdate: vi.fn(),
      dismissNotification: vi.fn(),
      openUpdateModal: vi.fn(),
      closeUpdateModal: vi.fn(),
      openReleaseNotesModal: vi.fn(),
      closeReleaseNotesModal: vi.fn(),
      setAutoCheck: vi.fn(),
      setAutoDownload: vi.fn(),
      setAllowPrerelease: vi.fn(),
      setGithubToken: vi.fn(),
      validateToken: vi.fn(),
    })

    render(
      <HelmetProvider>
        <ReleaseNotesPage />
      </HelmetProvider>
    )

    await waitFor(() => {
      expect(screen.getByText(/live web changelog item/i)).toBeInTheDocument()
    })
    expect(screen.getByText('v0.1.27')).toBeInTheDocument()
  })
})
