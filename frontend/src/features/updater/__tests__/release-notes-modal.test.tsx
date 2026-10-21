import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReleaseNotesModal } from '../components/release-notes-modal'
import * as updaterHook from '../hooks/use-app-updater'
import * as updaterUtils from '../utils/updater-utils'
import * as openExternalModule from '@/lib/utils/open-external'

describe('ReleaseNotesModal', () => {
  const openExternalSpy = vi.spyOn(openExternalModule, 'openExternal').mockImplementation(() => {})

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render dialog when isOpen is false', () => {
    render(<ReleaseNotesModal isOpen={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders title, version tag, and provided markdown release notes', () => {
    const md = '## Key Changes\n* feat(desktop): auto update feeds\n* fix: resolved edge crash'

    render(
      <ReleaseNotesModal
        isOpen={true}
        version="0.1.25"
        releaseNotes={md}
      />
    )

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: /release notes/i })).toBeInTheDocument()
    expect(screen.getByText('v0.1.25')).toBeInTheDocument()
    expect(screen.getByText(/key changes/i)).toBeInTheDocument()
    expect(screen.getByText(/auto update feeds/i)).toBeInTheDocument()
  })

  it('calls onClose when Close button is clicked', () => {
    const onCloseMock = vi.fn()
    render(
      <ReleaseNotesModal
        isOpen={true}
        version="0.1.25"
        releaseNotes="Simple update notes."
        onClose={onCloseMock}
      />
    )

    const closeBtn = screen.getByRole('button', { name: /^close$/i })
    fireEvent.click(closeBtn)
    expect(onCloseMock).toHaveBeenCalledTimes(1)
  })

  it('triggers openExternal with github release URL when View on GitHub is clicked', () => {
    render(
      <ReleaseNotesModal
        isOpen={true}
        version="0.1.25"
        releaseNotes="Simple update notes."
      />
    )

    const ghBtn = screen.getByRole('button', { name: /view on github/i })
    fireEvent.click(ghBtn)

    expect(openExternalSpy).toHaveBeenCalledWith(
      'https://github.com/dksilv4/Otix/releases/tag/v0.1.25',
      { newTab: true }
    )
  })

  it('fetches latest release notes when not provided initially', async () => {
    vi.spyOn(updaterUtils, 'fetchLatestReleaseNotes').mockResolvedValue({
      version: '0.1.26',
      notes: '## Remote Notes\n* Remotely fetched bugfix',
      publishedAt: '2026-10-21T12:00:00Z',
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
      isDesktop: true,
      isDismissed: false,
      isModalOpen: false,
      isReleaseNotesOpen: true,
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

    render(<ReleaseNotesModal />)

    await waitFor(() => {
      expect(screen.getByText(/remotely fetched bugfix/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/oct 21, 2026/i)).toBeInTheDocument()
  })
})
