import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeMachineSettings } from '../node-machine-settings'
import { apiClient } from '@/lib/api/client'
import type { GameServer } from '@/features/downloads/types'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}))

describe('NodeMachineSettings', () => {
  const mockServer: GameServer = {
    id: 8,
    name: 'Node ID:1',
    primaryUrl: 'http://127.0.0.1:8090',
    localUrl: 'http://127.0.0.1:8090',
    isOnline: true,
    isLocal: false,
    isActive: true,
    totalFiles: 4,
    storageFreeBytes: 34884472832,
    storageTotalBytes: 999182823424,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }

  const mockHardwareResponse = {
    platform: 'windows',
    supported: true,
    hostname: 'DK',
    serverName: 'Node ID:1',
    arch: 'amd64',
    numCpu: 16,
    goVersion: 'go1.23.12',
    uptimeSeconds: 120,
    hardware: {
      probedAt: new Date().toISOString(),
      cpu: {
        modelName: 'AMD Ryzen 7 9800X3D 8-Core Processor',
        cores: 8,
        threads: 16,
        baseClockMhz: 4700,
        architecture: 'amd64',
        vendor: 'AuthenticAMD',
      },
      memory: {
        totalBytes: 33346146304,
        availableBytes: 7017189376,
        usedBytes: 26328956928,
        usagePercent: 78,
      },
      gpus: [
        {
          name: 'NVIDIA GeForce RTX 5080',
          driverVersion: '610.88',
          vramBytes: 17094934528,
          isPrimary: true,
          isDiscrete: true,
        },
        {
          name: 'AMD Radeon(TM) Graphics',
          driverVersion: '32.0.13018.6',
          vramBytes: 536870912,
          isPrimary: false,
          isDiscrete: false,
        },
      ],
      storage: [
        {
          drive: 'C:\\',
          fileSystem: 'NTFS',
          totalBytes: 999182823424,
          freeBytes: 34884472832,
          usedBytes: 964298350592,
          usagePercent: 96.5,
        },
        {
          drive: 'D:\\',
          fileSystem: 'NTFS',
          totalBytes: 2000276156416,
          freeBytes: 765628522496,
          usedBytes: 1234647633920,
          usagePercent: 61.7,
        },
        {
          drive: 'E:\\',
          label: 'USB Sandisk Drive',
          fileSystem: 'FAT32',
          totalBytes: 64000000000,
          freeBytes: 32000000000,
          usedBytes: 32000000000,
          usagePercent: 50.0,
        },
      ],
      system: {
        manufacturer: 'Micro-Star International Co., Ltd.',
        model: 'MS-7E56',
        hostname: 'DK',
        biosVersion: '1.A81',
      },
      os: {
        name: 'Windows 11 Pro',
        version: '25H2',
        build: '26200',
        platform: 'windows',
        architecture: 'amd64',
      },
    },
    capabilities: {
      game_tracking: true,
      in_game_overlay: true,
      web_overlay: true,
      silent_install: true,
      saves_backup: true,
      downloader_provider: true,
    },
    launchOnStartup: false,
    minimizeToTray: false,
    closeToTray: false,
    alwaysOnTop: false,
    startMinimized: false,
    scanOnLaunch: false,
    gameTracking: true,
    overlayEnabled: true,
    overlayCorner: 'top-left',
    autoBackupOnExit: true,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch blocked in unit test')))
  })

  it('renders hardware specs and components when node data is loaded', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockHardwareResponse })

    render(<NodeMachineSettings server={mockServer} />)

    await waitFor(() => {
      expect(screen.getByText(/AMD Ryzen 7 9800X3D/i)).toBeInTheDocument()
    })

    // CPU specs
    expect(screen.getByText(/8C \/ 16T/i)).toBeInTheDocument()
    expect(screen.getByText(/4.70 GHz/i)).toBeInTheDocument()
    expect(screen.getByText(/AuthenticAMD/i)).toBeInTheDocument()

    // GPUs
    expect(screen.getByText(/NVIDIA GeForce RTX 5080/i)).toBeInTheDocument()
    expect(screen.getByText(/AMD Radeon\(TM\) Graphics/i)).toBeInTheDocument()
    expect(screen.getByText(/Discrete/i)).toBeInTheDocument()
    expect(screen.getAllByText(/Primary/i)[0]).toBeInTheDocument()
    expect(screen.getByText(/Driver: 610.88/i)).toBeInTheDocument()

    // RAM (Physical static spec only, normalized to installed tier 32 GB, no dynamic RAM load or 31.1 GB)
    expect(screen.getAllByText(/Physical Memory/i)[0]).toBeInTheDocument()
    expect(screen.getByText(/Installed Physical RAM/i)).toBeInTheDocument()
    expect(screen.getAllByText(/32 GB/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/31\.1/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/78% Load/i)).not.toBeInTheDocument()

    // Storage (Fixed internal drives only, USB excluded)
    expect(screen.getByText(/C:\\/i)).toBeInTheDocument()
    expect(screen.getByText(/D:\\/i)).toBeInTheDocument()
    expect(screen.queryByText(/USB Sandisk Drive/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/E:\\/i)).not.toBeInTheDocument()

    // System
    expect(screen.getByText(/MS-7E56/i)).toBeInTheDocument()
    expect(screen.getByText(/Windows 11 Pro/i)).toBeInTheDocument()
  })

  it('triggers hardware re-scan with refresh=true on click', async () => {
    const user = userEvent.setup()
    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockHardwareResponse })
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        ...mockHardwareResponse,
        hardware: {
          ...mockHardwareResponse.hardware,
          cpu: {
            ...mockHardwareResponse.hardware.cpu,
            modelName: 'AMD Ryzen 9 9950X 16-Core Processor',
          },
        },
      },
    })

    render(<NodeMachineSettings server={mockServer} />)

    await waitFor(() => {
      expect(screen.getByText(/AMD Ryzen 7 9800X3D/i)).toBeInTheDocument()
    })

    const rescanButton = screen.getByRole('button', { name: /Re-scan Hardware/i })
    await user.click(rescanButton)

    expect(apiClient.get).toHaveBeenCalledWith('/library/nodes/8/desktop?refresh=true')

    await waitFor(() => {
      expect(screen.getByText(/AMD Ryzen 9 9950X/i)).toBeInTheDocument()
    })
  })

  it('renders fallback state gracefully when no hardware object is present', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        platform: 'linux',
        hostname: 'ubuntu-node',
        arch: 'amd64',
        numCpu: 4,
        uptimeSeconds: 60,
        capabilities: { game_tracking: true },
      },
    })

    render(<NodeMachineSettings server={mockServer} />)

    await waitFor(() => {
      expect(screen.getByText(/System Identity/i)).toBeInTheDocument()
      expect(screen.getByText(/ubuntu-node/i)).toBeInTheDocument()
    })
  })

  it('renders displays with sanitized friendly titles without raw device paths', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        ...mockHardwareResponse,
        hardware: {
          ...mockHardwareResponse.hardware,
          displays: [
            {
              index: 1,
              deviceName: '\\\\.\\DISPLAY1',
              name: 'Display 1 (\\\\.\\DISPLAY1)',
              model: '2560x1440 Display',
              resolution: '2560x1440',
              refreshRate: 165,
              width: 2560,
              height: 1440,
              positionX: 0,
              positionY: 0,
              isPrimary: true,
              arrangement: 'Primary Display (Center)',
            },
            {
              index: 2,
              deviceName: '\\\\.\\DISPLAY2',
              name: '\\\\.\\DISPLAY2',
              model: 'LG ULTRAGEAR 27GP850',
              resolution: '2560x1440',
              refreshRate: 144,
              width: 2560,
              height: 1440,
              positionX: 2560,
              positionY: 0,
              isPrimary: false,
              arrangement: 'Right of Primary',
            },
            {
              index: 3,
              deviceName: '\\\\.\\DISPLAY3',
              name: 'Generic PnP Monitor',
              manufacturer: 'Dell',
              resolution: '1920x1080',
              refreshRate: 60,
              width: 1920,
              height: 1080,
              positionX: -1920,
              positionY: 0,
              isPrimary: false,
              arrangement: 'Left of Primary',
            },
          ],
        },
      },
    })

    render(<NodeMachineSettings server={mockServer} />)

    await waitFor(() => {
      expect(screen.getByText(/Connected Displays & Desktop Arrangement/i)).toBeInTheDocument()
    })

    expect(screen.getAllByText('Display 1').length).toBeGreaterThan(0)
    expect(screen.getAllByText('LG ULTRAGEAR 27GP850').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Dell Display 3').length).toBeGreaterThan(0)

    expect(screen.queryByText(/DISPLAY1/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/DISPLAY2/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Generic PnP Monitor/i)).not.toBeInTheDocument()
  })
})
