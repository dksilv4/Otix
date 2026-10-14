import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsEmulatorsCard } from '../settings-emulators-card'
import { clearDesktopAPICache, type DetectedEmulator } from '@/lib/desktop/api'

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
}))

describe('SettingsEmulatorsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearDesktopAPICache()
    delete (window as any).desktopAPI
  })

  it('renders web fallback message when desktop client is not detected', () => {
    render(<SettingsEmulatorsCard />)
    expect(screen.getByText('Emulators & Consoles')).toBeDefined()
    expect(
      screen.getByText(/Emulators and local process dispatching are managed through the Otix Desktop application/),
    ).toBeDefined()
  })

  it('renders detected emulators and allows picking custom paths', async () => {
    const mockEmulators: DetectedEmulator[] = [
      {
        id: 'pcsx2',
        name: 'PCSX2',
        installed: true,
        executablePath: 'C:/Program Files/PCSX2/pcsx2-qt.exe',
        isCustomPath: false,
        definition: {
          id: 'pcsx2',
          name: 'PCSX2',
          description: 'PlayStation 2 emulator',
          platforms: ['ps2'],
          extensions: ['.iso', '.chd'],
          defaultExecutable: 'pcsx2-qt.exe',
          executableLookup: [],
          launchTemplate: ['{romPath}'],
        },
      },
      {
        id: 'dolphin',
        name: 'Dolphin',
        installed: false,
        executablePath: null,
        isCustomPath: false,
        definition: {
          id: 'dolphin',
          name: 'Dolphin',
          description: 'GameCube and Wii emulator',
          platforms: ['gamecube', 'wii'],
          extensions: ['.rvz'],
          defaultExecutable: 'Dolphin.exe',
          executableLookup: [],
          launchTemplate: ['{romPath}'],
        },
      },
    ]

    const mockGetEmulators = vi.fn().mockResolvedValue(mockEmulators)
    const mockGetSettings = vi.fn().mockResolvedValue({
      emulatorPaths: {},
      defaultPlatformEmulators: { ps2: 'pcsx2', gamecube: 'dolphin' },
    })
    const mockPickExe = vi.fn().mockResolvedValue('D:/Emulators/Dolphin.exe')
    const mockSetSettings = vi.fn().mockResolvedValue({})

    ;(window as any).desktopAPI = {
      getEmulators: mockGetEmulators,
      getDesktopSettings: mockGetSettings,
      pickExecutable: mockPickExe,
      setDesktopSettings: mockSetSettings,
    }

    render(<SettingsEmulatorsCard />)

    await waitFor(() => {
      expect(screen.getAllByText('PCSX2').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Detected').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Dolphin').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Not Found').length).toBeGreaterThan(0)
    })

    const browseButtons = screen.getAllByRole('button', { name: /browse/i })
    expect(browseButtons.length).toBe(2)

    fireEvent.click(browseButtons[1]) // Dolphin browse button

    await waitFor(() => {
      expect(mockPickExe).toHaveBeenCalled()
      expect(mockSetSettings).toHaveBeenCalledWith({
        emulatorPaths: {
          dolphin: 'D:/Emulators/Dolphin.exe',
        },
      })
    })
  })
})
