import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InstallerWelcomeStep } from '../components/installer-welcome-step'
import { InstallerConfigStep } from '../components/installer-config-step'
import { InstallerProgressStep } from '../components/installer-progress-step'
import { InstallerCompleteStep } from '../components/installer-complete-step'
import { UninstallerView } from '../components/uninstaller-view'

describe('Installer Components', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('renders InstallerWelcomeStep with hero branding and features', () => {
    const onGetStarted = vi.fn()
    const onQuickInstall = vi.fn()
    const onExit = vi.fn()

    render(
      <InstallerWelcomeStep
        version="0.1.24"
        onGetStarted={onGetStarted}
        onQuickInstall={onQuickInstall}
        onExit={onExit}
      />,
    )

    expect(screen.getByText('The All-In-One Gaming Command Center')).toBeDefined()
    expect(screen.getByText('v0.1.24 · Public Preview')).toBeDefined()
    expect(screen.getByText('Unified Game Library')).toBeDefined()
    expect(screen.getByText('CS2 & Live Game HUD')).toBeDefined()
    expect(screen.getByRole('button', { name: /Get Started/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Quick Install/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Exit Setup/i })).toBeDefined()
  })

  it('renders InstallerConfigStep with correct version and path', () => {
    const onInstall = vi.fn()
    const onBack = vi.fn()
    const onCancel = vi.fn()
    const onBrowse = vi.fn()

    render(
      <InstallerConfigStep
        version="0.1.24"
        installPath="C:\Program Files\Otix"
        onInstallPathChange={vi.fn()}
        onBrowse={onBrowse}
        createDesktopShortcut={true}
        onCreateDesktopShortcutChange={vi.fn()}
        createStartMenuShortcut={true}
        onCreateStartMenuShortcutChange={vi.fn()}
        startOnBoot={false}
        onStartOnBootChange={vi.fn()}
        diskSpace={{ freeBytes: 100 * 1024 * 1024 * 1024, totalBytes: 500 * 1024 * 1024 * 1024, drive: 'C:' }}
        hasSpace={true}
        isElevated={true}
        onStartInstall={onInstall}
        onBack={onBack}
        onCancel={onCancel}
        isSubmitting={false}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Install Otix' })).toBeDefined()
    expect(screen.getByText('v0.1.24')).toBeDefined()
    expect(screen.getByText('Create Desktop shortcut')).toBeDefined()
    expect(screen.getByText('Create Start Menu shortcut')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Install Otix' })).toBeDefined()
    expect(screen.getByRole('button', { name: '← Back' })).toBeDefined()
  })

  it('renders InstallerProgressStep with percentage and status', () => {
    render(
      <InstallerProgressStep
        progress={{ percent: 45, status: 'Extracting core binaries...' }}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Installing Otix...')).toBeDefined()
    expect(screen.getByText('Extracting core binaries...')).toBeDefined()
    expect(screen.getAllByText('45%').length).toBeGreaterThan(0)
  })

  it('renders InstallerCompleteStep with launch button', () => {
    const onFinish = vi.fn()
    render(
      <InstallerCompleteStep
        version="0.1.24"
        launchOnExit={true}
        onLaunchOnExitChange={vi.fn()}
        onFinish={onFinish}
      />,
    )

    expect(screen.getByText('Ready to Play!')).toBeDefined()
    expect(screen.getByText('Launch Otix')).toBeDefined()
  })

  it('renders UninstallerView with confirmation prompts', () => {
    render(<UninstallerView />)
    expect(screen.getByText('Uninstall Otix')).toBeDefined()
    expect(screen.getByText(/Are you sure you want to uninstall Otix/i)).toBeDefined()
  })
})
