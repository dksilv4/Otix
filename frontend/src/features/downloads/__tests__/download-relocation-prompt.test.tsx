import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DownloadRelocationPrompt } from '../components/molecules/download-relocation-prompt'
import {
  computeNormalizedTargetPath,
  cleanReleaseTitle,
  normalizePathSeparators,
  useDownloadRelocation,
  AUTO_ORGANIZE_STORAGE_KEY,
  type RelocationItem,
} from '../hooks/use-download-relocation'
import { clearDesktopAPICache } from '@/lib/desktop/api'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

describe('DownloadRelocationPrompt Molecule', () => {
  const sampleItems: RelocationItem[] = [
    {
      id: 'dl-1',
      title: 'Cyberpunk 2077',
      sourceFilename: 'Cyberpunk.2077.v2.1-RUNE',
      sourcePath: '~/Downloads/Games/Cyberpunk.2077.v2.1-RUNE',
      targetPath: 'D:/Games/Cyberpunk 2077 (2020)/Cyberpunk.2077.v2.1-RUNE',
      sourceType: 'staging',
      formatCategory: 'game',
      platform: 'PC',
      releaseGroup: 'RUNE',
      year: 2020,
      status: 'pending',
    },
    {
      id: 'dl-2',
      title: "Baldur's Gate 3",
      sourceFilename: 'Baldurs.Gate.3-RUNE.iso',
      sourcePath: '~/Downloads/Baldurs.Gate.3-RUNE.iso',
      targetPath: "D:/Games/Baldur's Gate 3 (2023)/Baldurs.Gate.3-RUNE.iso",
      sourceType: 'download',
      formatCategory: 'iso',
      platform: 'PC',
      releaseGroup: 'RUNE',
      year: 2023,
      status: 'pending',
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    clearDesktopAPICache()
    localStorage.clear()
    delete (window as any).desktopAPI
    delete (window as any).electronAPI
  })

  describe('Prompt Rendering', () => {
    it('returns null and does not render when items array is empty', () => {
      const { container } = render(
        <DownloadRelocationPrompt items={[]} autoOrganizeEnabled={false} />,
      )
      expect(container.firstChild).toBeNull()
    })

    it('renders the relocation prompt card when unorganized items are detected', () => {
      render(
        <DownloadRelocationPrompt
          items={[sampleItems[0]]}
          autoOrganizeEnabled={false}
        />,
      )

      expect(screen.getByRole('region', { name: /download relocation prompt/i })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /relocate to library/i })).toBeInTheDocument()
      expect(screen.getByTestId('relocate-button')).toBeInTheDocument()
      expect(screen.getByText(/completed download detected in staging/i)).toBeInTheDocument()
      expect(screen.getByText('PC')).toBeInTheDocument()
      expect(screen.getByText('RUNE')).toBeInTheDocument()
    })

    it('shows the total item count badge when multiple unorganized items exist', () => {
      render(
        <DownloadRelocationPrompt
          items={sampleItems}
          autoOrganizeEnabled={false}
        />,
      )

      expect(screen.getByText('2 ready')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /relocate all \(2\)/i })).toBeInTheDocument()
    })

    it('calls onDismiss when clicking the dismiss button', async () => {
      const user = userEvent.setup()
      const onDismiss = vi.fn()

      render(
        <DownloadRelocationPrompt
          items={[sampleItems[0]]}
          autoOrganizeEnabled={false}
          onDismiss={onDismiss}
        />,
      )

      const dismissButton = screen.getByRole('button', { name: /dismiss prompt/i })
      await user.click(dismissButton)

      expect(onDismiss).toHaveBeenCalledWith('dl-1')
    })
  })

  describe('Destination Path Preview', () => {
    it('displays source staging path and proposed target destination path cleanly', () => {
      render(
        <DownloadRelocationPrompt
          items={[sampleItems[0]]}
          autoOrganizeEnabled={false}
        />,
      )

      const sourcePreview = screen.getByTestId('relocation-source-path')
      const targetPreview = screen.getByTestId('relocation-target-path')

      expect(sourcePreview).toHaveTextContent('~/Downloads/Games/Cyberpunk.2077.v2.1-RUNE')
      expect(targetPreview).toHaveTextContent('D:/Games/Cyberpunk 2077 (2020)/Cyberpunk.2077.v2.1-RUNE')
      expect(screen.getByText(/proposed destination/i)).toBeInTheDocument()
    })

    it('displays ISO destination path accurately for single archive/ISO file', () => {
      render(
        <DownloadRelocationPrompt
          items={[sampleItems[1]]}
          autoOrganizeEnabled={false}
        />,
      )

      const sourcePreview = screen.getByTestId('relocation-source-path')
      const targetPreview = screen.getByTestId('relocation-target-path')

      expect(sourcePreview).toHaveTextContent('~/Downloads/Baldurs.Gate.3-RUNE.iso')
      expect(targetPreview).toHaveTextContent("D:/Games/Baldur's Gate 3 (2023)/Baldurs.Gate.3-RUNE.iso")
    })
  })

  describe('1-Click Relocate Action', () => {
    it('triggers onRelocate mutation with item ID on button click', async () => {
      const user = userEvent.setup()
      const onRelocate = vi.fn()

      render(
        <DownloadRelocationPrompt
          items={[sampleItems[0]]}
          autoOrganizeEnabled={false}
          onRelocate={onRelocate}
        />,
      )

      const relocateButton = screen.getByTestId('relocate-button')
      expect(relocateButton).toHaveTextContent('Relocate to Library')
      await user.click(relocateButton)

      expect(onRelocate).toHaveBeenCalledTimes(1)
      expect(onRelocate).toHaveBeenCalledWith('dl-1')
    })

    it('shows loading state and disables relocate button when relocation is in progress', () => {
      render(
        <DownloadRelocationPrompt
          items={[sampleItems[0]]}
          autoOrganizeEnabled={false}
          isRelocating={true}
        />,
      )

      const relocateButton = screen.getByTestId('relocate-button')
      expect(relocateButton).toHaveTextContent('Relocating...')
      expect(relocateButton).toBeDisabled()
    })

    it('calls onRelocateAll when clicking Relocate All button', async () => {
      const user = userEvent.setup()
      const onRelocateAll = vi.fn()

      render(
        <DownloadRelocationPrompt
          items={sampleItems}
          autoOrganizeEnabled={false}
          onRelocateAll={onRelocateAll}
        />,
      )

      const relocateAllButton = screen.getByRole('button', { name: /relocate all \(2\)/i })
      await user.click(relocateAllButton)

      expect(onRelocateAll).toHaveBeenCalledTimes(1)
    })
  })

  describe('Auto-Organize Setting Toggle', () => {
    it('renders DkSwitch representing auto-organize setting', () => {
      render(
        <DownloadRelocationPrompt
          items={[sampleItems[0]]}
          autoOrganizeEnabled={false}
        />,
      )

      const switchEl = screen.getByRole('switch')
      expect(switchEl).toBeInTheDocument()
      expect(switchEl).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText(/auto-organize/i)).toBeInTheDocument()
    })

    it('reflects active state when autoOrganizeEnabled is true', () => {
      render(
        <DownloadRelocationPrompt
          items={[sampleItems[0]]}
          autoOrganizeEnabled={true}
        />,
      )

      const switchEl = screen.getByRole('switch')
      expect(switchEl).toHaveAttribute('aria-checked', 'true')
    })

    it('triggers onAutoOrganizeToggle callback when switch is toggled', async () => {
      const user = userEvent.setup()
      const onAutoOrganizeToggle = vi.fn()

      render(
        <DownloadRelocationPrompt
          items={[sampleItems[0]]}
          autoOrganizeEnabled={false}
          onAutoOrganizeToggle={onAutoOrganizeToggle}
        />,
      )

      const switchEl = screen.getByRole('switch')
      await user.click(switchEl)

      expect(onAutoOrganizeToggle).toHaveBeenCalledTimes(1)
      expect(onAutoOrganizeToggle).toHaveBeenCalledWith(true)
    })
  })

  describe('Target Path Normalization Engine', () => {
    it('normalizes path separators and cleans redundant slashes', () => {
      expect(normalizePathSeparators('D:\\Games\\Library\\')).toBe('D:/Games/Library')
      expect(normalizePathSeparators('//server//share//games/')).toBe('/server/share/games')
    })

    it('extracts release metadata and cleans scene release names', () => {
      const parsed = cleanReleaseTitle('Cyberpunk.2077.v2.1-RUNE')
      expect(parsed.cleanTitle).toBe('Cyberpunk 2077')
      expect(parsed.group).toBe('RUNE')
      expect(parsed.platform).toBe('PC')
    })

    it('extracts year and edition from release titles', () => {
      const parsed = cleanReleaseTitle('Elden.Ring.Shadow.of.the.Erdtree.Deluxe.Edition.2024-ELAMIGOS')
      expect(parsed.cleanTitle).toContain('Elden Ring Shadow of the Erdtree')
      expect(parsed.year).toBe(2024)
      expect(parsed.edition?.toLowerCase()).toContain('deluxe edition')
      expect(parsed.group).toBe('ELAMIGOS')
    })

    it('computes normalized target path with standard library structure', () => {
      const target = computeNormalizedTargetPath(
        '~/Downloads/Games/Cyberpunk.2077.2020-RUNE',
        'D:/Games',
      )
      expect(target).toBe('D:/Games/Cyberpunk 2077 (2020)/Cyberpunk.2077.2020-RUNE')
    })

    it('applies custom naming templates with token replacement', () => {
      const template = '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}'
      const target = computeNormalizedTargetPath(
        'C:\\Downloads\\Super.Mario.64.1996.N64.z64',
        'D:/Games/ROMs',
        template,
      )
      expect(target).toBe('D:/Games/ROMs/Super Mario 64 (1996) [N64]/Super.Mario.64.1996.N64.z64')
    })
  })

  describe('useDownloadRelocation Hook Integration', () => {
    const TestHookComponent = () => {
      const {
        unorganizedItems,
        autoOrganizeEnabled,
        setAutoOrganizeEnabled,
        relocate,
        addUnorganizedItem,
      } = useDownloadRelocation({ initialItems: sampleItems })

      return (
        <div>
          <span data-testid="item-count">{unorganizedItems.length}</span>
          <span data-testid="auto-organize-state">{String(autoOrganizeEnabled)}</span>
          <button
            data-testid="toggle-auto"
            onClick={() => setAutoOrganizeEnabled(!autoOrganizeEnabled)}
          >
            Toggle Auto
          </button>
          <button
            data-testid="relocate-first"
            onClick={() => {
              if (unorganizedItems[0]) relocate(unorganizedItems[0].id)
            }}
          >
            Relocate First
          </button>
          <button
            data-testid="add-item"
            onClick={() =>
              addUnorganizedItem({
                sourcePath: '/Volumes/Samba/staging/Super.Mario.64.z64',
                sourceType: 'samba',
              })
            }
          >
            Add Samba Item
          </button>
        </div>
      )
    }

    it('initializes items and updates autoOrganizeEnabled toggle', async () => {
      const user = userEvent.setup()
      render(<TestHookComponent />)

      expect(screen.getByTestId('item-count')).toHaveTextContent('2')
      expect(screen.getByTestId('auto-organize-state')).toHaveTextContent('false')

      await user.click(screen.getByTestId('toggle-auto'))
      expect(screen.getByTestId('auto-organize-state')).toHaveTextContent('true')
      expect(localStorage.getItem(AUTO_ORGANIZE_STORAGE_KEY)).toBe('true')
    })

    it('relocates item and removes it from unorganized items', async () => {
      const user = userEvent.setup()
      ;(window as any).desktopAPI = {
        executeOrganization: vi.fn().mockResolvedValue([{ success: true }]),
        hydrateMatchedGames: vi.fn().mockResolvedValue(undefined),
      }

      render(<TestHookComponent />)
      expect(screen.getByTestId('item-count')).toHaveTextContent('2')

      await user.click(screen.getByTestId('relocate-first'))

      await waitFor(() => {
        expect(screen.getByTestId('item-count')).toHaveTextContent('1')
      })
      expect((window as any).desktopAPI.executeOrganization).toHaveBeenCalledWith([
        {
          sourcePath: sampleItems[0].sourcePath,
          targetPath: sampleItems[0].targetPath,
        },
      ])
    })

    it('allows dynamically detecting and adding multi-source downloads', async () => {
      const user = userEvent.setup()
      render(<TestHookComponent />)

      expect(screen.getByTestId('item-count')).toHaveTextContent('2')

      await user.click(screen.getByTestId('add-item'))

      await waitFor(() => {
        expect(screen.getByTestId('item-count')).toHaveTextContent('3')
      })
    })
  })
})
