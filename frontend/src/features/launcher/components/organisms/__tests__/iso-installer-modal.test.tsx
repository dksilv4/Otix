import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { IsoInstallerModal } from '../iso-installer-modal'

vi.mock('@/features/launcher/data/storage', () => ({
  hasDesktopAPI: vi.fn().mockReturnValue(true),
  getScanPaths: vi.fn().mockReturnValue(['/default/scan/path']),
  markGameInstalled: vi.fn(),
}))

vi.mock('@/components/path-picker', () => ({
  usePickFolder: () => vi.fn().mockResolvedValue('/picked/folder'),
}))

vi.mock('@/features/launcher/data/install-store', () => ({
  useInstallProgress: () => ({
    installs: [],
    startInstall: vi.fn(),
    updateProgress: vi.fn(),
    completeInstall: vi.fn(),
    failInstall: vi.fn(),
    cancelInstall: vi.fn(),
    dismissInstall: vi.fn(),
  }),
}))

describe('IsoInstallerModal', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('suggests targetDir using otix:games-install-dir when set in localStorage', async () => {
    localStorage.setItem('otix:games-install-dir', 'D:/Custom/Games')

    render(
      <IsoInstallerModal
        onClose={vi.fn()}
        games={[]}
        initialIsoPath="/downloads/Cyberpunk2077.iso"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('D:/Custom/Games/Cyberpunk2077')).toBeInTheDocument()
    })
  })

  it('falls back to scan paths when otix:games-install-dir is not set', async () => {
    render(
      <IsoInstallerModal
        onClose={vi.fn()}
        games={[]}
        initialIsoPath="/downloads/Cyberpunk2077.iso"
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('/default/scan/path/Cyberpunk2077')).toBeInTheDocument()
    })
  })
})
