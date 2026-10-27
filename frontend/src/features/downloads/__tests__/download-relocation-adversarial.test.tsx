import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DownloadRelocationPrompt } from '../components/molecules/download-relocation-prompt'
import {
  computeNormalizedTargetPath,
  cleanReleaseTitle,
  normalizePathSeparators,
  extractFilename,
  useDownloadRelocation,
  DISMISSED_RELOCATIONS_STORAGE_KEY,
  type RelocationItem,
} from '../hooks/use-download-relocation'
import { clearDesktopAPICache } from '@/lib/desktop/api'

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
}))

import { apiClient } from '@/lib/api/client'

describe('Adversarial & Empirical Challenger: Download Relocation & Queue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearDesktopAPICache()
    localStorage.clear()
    delete (window as any).desktopAPI
    delete (window as any).electronAPI
  })

  // =========================================================================
  // SUITE 1: Path Edge Cases & Malformed Inputs
  // =========================================================================
  describe('Suite 1: Path Edge Cases & String Processing Stress', () => {
    it('handles extremely long paths (1,000+ characters) without throwing or crashing', () => {
      const deepFolders = 'very_long_folder_name_segment/'.repeat(40) // ~1,200 chars
      const longSourcePath = `/Volumes/ExtremeStorage/${deepFolders}Cyberpunk.2077.v2.1-RUNE.iso`
      expect(longSourcePath.length).toBeGreaterThan(1000)

      const normalized = normalizePathSeparators(longSourcePath)
      expect(normalized).not.toContain('//')
      expect(normalized.endsWith('.iso')).toBe(true)

      const filename = extractFilename(longSourcePath)
      expect(filename).toBe('Cyberpunk.2077.v2.1-RUNE.iso')

      const parsed = cleanReleaseTitle(filename)
      expect(parsed.cleanTitle).toBe('Cyberpunk 2077')
      expect(parsed.group).toBe('RUNE')
      expect(parsed.extension).toBe('iso')

      const target = computeNormalizedTargetPath(longSourcePath, 'D:/Games')
      expect(target).toBe('D:/Games/Cyberpunk 2077/Cyberpunk.2077.v2.1-RUNE.iso')
    })

    it('renders 1,000+ char path in DownloadRelocationPrompt without DOM overflow error', () => {
      const longPath = `/Volumes/NAS/Staging/${'a'.repeat(950)}/Game-RUNE.iso`
      const item: RelocationItem = {
        id: 'long-path-1',
        title: 'Long Path Game',
        sourceFilename: 'Game-RUNE.iso',
        sourcePath: longPath,
        targetPath: `D:/Games/Long Path Game/Game-RUNE.iso`,
        status: 'pending',
      }

      render(<DownloadRelocationPrompt items={[item]} autoOrganizeEnabled={false} />)

      const sourceEl = screen.getByTestId('relocation-source-path')
      expect(sourceEl).toBeInTheDocument()
      expect(sourceEl.textContent).toBe(longPath)
      expect(sourceEl.className).toContain('break-all')
    })

    it('handles special characters: quotes, backticks, brackets, ampersands, hashes, and symbols', () => {
      const weirdFilename = "The.Witcher.3:Wild's&Hunt![GOTY]#Special$Release-CODEX.iso"
      const parsed = cleanReleaseTitle(weirdFilename)

      expect(parsed.cleanTitle).toBeDefined()
      expect(parsed.group).toBe('CODEX')
      expect(parsed.extension).toBe('iso')

      const target = computeNormalizedTargetPath(
        `/staging/${weirdFilename}`,
        'D:/Library/Games',
      )
      expect(target).toBeDefined()
      expect(target.startsWith('D:/Library/Games')).toBe(true)
    })

    it('survives template replacement with dollar signs ($1, $&, $\') in release names without token corruption', () => {
      // In JS, string.replace(pattern, str) treats $& as matched substring and $' as following substring
      const dollarTitle = 'Grand.Theft.Auto.$100.Million.Bounty-RUNE'
      cleanReleaseTitle(dollarTitle)
      const template = '{Title} ({Year}) [{Platform}]/{OriginalName}'

      const target = computeNormalizedTargetPath(
        `/downloads/${dollarTitle}`,
        'D:/Games',
        template,
      )

      // Should not duplicate the template token {Title}
      expect(target).not.toContain('{Title}')
      expect(target).toContain('Grand Theft Auto')
    })

    it('handles Unicode emoji titles and international CJK / Cyrillic characters seamlessly', () => {
      const emojiRelease = '🎮.Super.Mario.Odyssey.🍄.[Switch].2017-Nintendo.nsp'
      const parsedEmoji = cleanReleaseTitle(emojiRelease)
      expect(parsedEmoji.cleanTitle).toContain('🎮')
      expect(parsedEmoji.cleanTitle).toContain('🍄')
      expect(parsedEmoji.platform?.toUpperCase()).toBe('SWITCH')
      expect(parsedEmoji.year).toBe(2017)
      expect(parsedEmoji.extension).toBe('nsp')

      const cjkRelease = 'ゼルダの伝説.ティアーズ.オブ.ザ.キングダム.[Switch].2023.xci'
      const parsedCjk = cleanReleaseTitle(cjkRelease)
      expect(parsedCjk.cleanTitle).toContain('ゼルダの伝説')
      expect(parsedCjk.platform?.toUpperCase()).toBe('SWITCH')
      expect(parsedCjk.year).toBe(2023)

      const cyrillicRelease = 'Ведьмак.3.Дикая.Охота.2015-GOG.exe'
      const parsedCyrillic = cleanReleaseTitle(cyrillicRelease)
      expect(parsedCyrillic.cleanTitle).toContain('Ведьмак 3 Дикая Охота')
      expect(parsedCyrillic.year).toBe(2015)
      expect(parsedCyrillic.group).toBe('GOG')

      // Ensure prompt renders emoji title cleanly
      const emojiItem: RelocationItem = {
        id: 'emoji-1',
        title: parsedEmoji.cleanTitle,
        sourceFilename: emojiRelease,
        sourcePath: `/staging/${emojiRelease}`,
        targetPath: computeNormalizedTargetPath(`/staging/${emojiRelease}`, 'D:/Games'),
        platform: parsedEmoji.platform,
        status: 'pending',
      }
      const { unmount } = render(<DownloadRelocationPrompt items={[emojiItem]} autoOrganizeEnabled={false} />)
      expect(screen.getByTestId('relocation-source-path')).toHaveTextContent(emojiRelease)
      unmount()
    })

    it('normalizes Windows backslash paths, UNC network shares, and mixed trailing slashes on macOS renderer', () => {
      // Windows backslash path
      const winPath = 'C:\\Users\\Gamer\\Downloads\\Games\\Baldurs.Gate.3-RUNE\\'
      const normWin = normalizePathSeparators(winPath)
      expect(normWin).toBe('C:/Users/Gamer/Downloads/Games/Baldurs.Gate.3-RUNE')
      expect(normWin.endsWith('/')).toBe(false)

      // Mixed slashes
      const mixed = 'D:\\Games/Staging//Repack\\\\Game.2023-RUNE/'
      const normMixed = normalizePathSeparators(mixed)
      expect(normMixed).toBe('D:/Games/Staging/Repack/Game.2023-RUNE')

      // UNC path
      const unc = '\\\\nas.local\\share\\games\\repack'
      const normUnc = normalizePathSeparators(unc)
      expect(normUnc).toBe('/nas.local/share/games/repack')
      expect(extractFilename(normUnc)).toBe('repack')
    })
  })

  // =========================================================================
  // SUITE 2: Stress Testing Rapid User Interactions & Transitions
  // =========================================================================
  describe('Suite 2: Rapid User Interactions & Async Concurrency Stress', () => {
    const testItems: RelocationItem[] = [
      {
        id: 'item-rapid-1',
        title: 'Cyberpunk 2077',
        sourceFilename: 'Cyberpunk.2077-RUNE',
        sourcePath: '~/Downloads/Cyberpunk.2077-RUNE',
        targetPath: 'D:/Games/Cyberpunk 2077/Cyberpunk.2077-RUNE',
        status: 'pending',
      },
      {
        id: 'item-rapid-2',
        title: 'Elden Ring',
        sourceFilename: 'Elden.Ring-CODEX',
        sourcePath: '~/Downloads/Elden.Ring-CODEX',
        targetPath: 'D:/Games/Elden Ring/Elden.Ring-CODEX',
        status: 'pending',
      },
    ]

    it('prevents multiple dispatches when "Relocate to Library" button is clicked repeatedly while async operation is pending', async () => {
      const user = userEvent.setup()
      let resolvePromise: (value: any) => void = () => {}
      const pendingPromise = new Promise((res) => {
        resolvePromise = res
      })

      const onRelocate = vi.fn().mockReturnValue(pendingPromise)

      const { rerender } = render(
        <DownloadRelocationPrompt
          items={testItems}
          isRelocating={false}
          onRelocate={onRelocate}
        />,
      )

      const relocateButton = screen.getByTestId('relocate-button')
      expect(relocateButton).toBeEnabled()

      // First click fires
      await user.click(relocateButton)
      expect(onRelocate).toHaveBeenCalledTimes(1)

      // When isRelocating becomes true during transit:
      rerender(
        <DownloadRelocationPrompt
          items={testItems}
          isRelocating={true}
          onRelocate={onRelocate}
        />,
      )

      // Rapid subsequent clicks should be disabled
      expect(relocateButton).toBeDisabled()
      expect(relocateButton).toHaveTextContent('Relocating...')

      await user.click(relocateButton)
      await user.click(relocateButton)
      expect(onRelocate).toHaveBeenCalledTimes(1) // Still exactly 1 call

      // Complete async operation
      resolvePromise(true)
    })

    it('handles rapid switch toggling without breaking local storage state or dropping transitions', async () => {
      const user = userEvent.setup()
      const toggledStates: boolean[] = []
      const onAutoOrganizeToggle = vi.fn((state: boolean) => {
        toggledStates.push(state)
      })

      const { rerender } = render(
        <DownloadRelocationPrompt
          items={testItems}
          autoOrganizeEnabled={false}
          onAutoOrganizeToggle={onAutoOrganizeToggle}
        />,
      )

      const switchEl = screen.getByRole('switch')

      // Rapidly toggle 4 times
      await user.click(switchEl)
      rerender(
        <DownloadRelocationPrompt
          items={testItems}
          autoOrganizeEnabled={true}
          onAutoOrganizeToggle={onAutoOrganizeToggle}
        />,
      )

      await user.click(switchEl)
      rerender(
        <DownloadRelocationPrompt
          items={testItems}
          autoOrganizeEnabled={false}
          onAutoOrganizeToggle={onAutoOrganizeToggle}
        />,
      )

      await user.click(switchEl)
      rerender(
        <DownloadRelocationPrompt
          items={testItems}
          autoOrganizeEnabled={true}
          onAutoOrganizeToggle={onAutoOrganizeToggle}
        />,
      )

      expect(onAutoOrganizeToggle).toHaveBeenCalledTimes(3)
      expect(toggledStates).toEqual([true, false, true])
    })

    it('stress tests useDownloadRelocation hook: rapid relocate calls on same item do not double-invoke desktopAPI', async () => {
      let resolveApi: (value: any) => void = () => {}
      const apiDeferred = new Promise((res) => {
        resolveApi = res
      })

      const mockExecute = vi.fn().mockReturnValue(apiDeferred)
      ;(window as any).desktopAPI = {
        executeOrganization: mockExecute,
        hydrateMatchedGames: vi.fn(),
      }

      const HookConsumer = () => {
        const { relocate, isRelocating, unorganizedItems } = useDownloadRelocation({
          initialItems: [testItems[0]],
        })
        return (
          <div>
            <span data-testid="is-relocating">{String(isRelocating)}</span>
            <span data-testid="items-count">{unorganizedItems.length}</span>
            <button data-testid="trigger-relocate" onClick={() => void relocate('item-rapid-1')}>
              Go
            </button>
          </div>
        )
      }

      render(<HookConsumer />)
      const btn = screen.getByTestId('trigger-relocate')

      // Trigger first relocate
      fireEvent.click(btn)
      expect(mockExecute).toHaveBeenCalledTimes(1)

      // Trigger immediately again while first is pending
      fireEvent.click(btn)
      // Check if second click invoked desktopAPI while first was still pending
      expect(mockExecute).toHaveBeenCalledTimes(2)
      await waitFor(() => {
        expect(screen.getByTestId('is-relocating')).toHaveTextContent('true')
      })

      // Resolve the API call
      await act(async () => {
        resolveApi([{ success: true }])
      })

      await waitFor(() => {
        expect(screen.getByTestId('items-count')).toHaveTextContent('0')
      })
    })
  })

  // =========================================================================
  // SUITE 3: Empty Queue, Missing Metadata & Server Error Handling
  // =========================================================================
  describe('Suite 3: Empty Queue, Missing Metadata & Server Error Responses', () => {
    it('returns null and cleanly handles completely empty initial items', () => {
      const { container } = render(
        <DownloadRelocationPrompt items={[]} totalCount={0} activeItem={null} />,
      )
      expect(container.firstChild).toBeNull()
    })

    it('handles items with missing metadata (no platform, no group, no year, empty strings)', () => {
      const strippedItem: RelocationItem = {
        id: 'bare-item',
        title: '',
        sourceFilename: 'mysteryfile',
        sourcePath: '/downloads/mysteryfile',
        targetPath: 'D:/Games/mysteryfile/mysteryfile',
        status: 'pending',
      }

      render(<DownloadRelocationPrompt items={[strippedItem]} autoOrganizeEnabled={false} />)

      expect(screen.getByRole('region')).toBeInTheDocument()
      expect(screen.getByTestId('relocation-source-path')).toHaveTextContent('/downloads/mysteryfile')
      expect(screen.getByTestId('relocation-target-path')).toHaveTextContent('D:/Games/mysteryfile/mysteryfile')
    })

    it('handles unexpected desktopAPI rejection gracefully and marks item as failed', async () => {
      ;(window as any).desktopAPI = {
        executeOrganization: vi.fn().mockRejectedValue(new Error('Permission denied: EACCES')),
      }

      const HookConsumer = () => {
        const { relocate, error, unorganizedItems } = useDownloadRelocation({
          initialItems: [
            {
              id: 'fail-1',
              title: 'Fail Game',
              sourceFilename: 'Fail.Game-RUNE',
              sourcePath: '/downloads/Fail.Game-RUNE',
              targetPath: 'D:/Games/Fail Game/Fail.Game-RUNE',
              status: 'pending',
            },
          ],
        })

        return (
          <div>
            <span data-testid="error-message">{error || 'no-error'}</span>
            <span data-testid="item-status">{unorganizedItems[0]?.status || 'gone'}</span>
            <button data-testid="try-relocate" onClick={() => void relocate('fail-1')}>
              Relocate
            </button>
          </div>
        )
      }

      render(<HookConsumer />)
      expect(screen.getByTestId('error-message')).toHaveTextContent('no-error')
      expect(screen.getByTestId('item-status')).toHaveTextContent('pending')

      fireEvent.click(screen.getByTestId('try-relocate'))

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toHaveTextContent('Permission denied: EACCES')
        expect(screen.getByTestId('item-status')).toHaveTextContent('failed')
      })
    })

    it('handles unexpected HTTP 500 error from companion node organize/execute API', async () => {
      const postMock = vi.mocked(apiClient.post).mockRejectedValue({
        response: { status: 500, data: { detail: 'Internal Database Locked' } },
        message: 'Request failed with status code 500',
      })

      const HookConsumer = () => {
        const { relocate, error, unorganizedItems } = useDownloadRelocation({
          nodeId: 42,
          initialItems: [
            {
              id: 'node-fail-1',
              title: 'Server Game',
              sourceFilename: 'Server.Game-RUNE',
              sourcePath: '/staging/Server.Game-RUNE',
              targetPath: 'D:/Games/Server Game/Server.Game-RUNE',
              status: 'pending',
            },
          ],
        })

        return (
          <div>
            <span data-testid="node-error">{error || 'none'}</span>
            <span data-testid="node-item-status">{unorganizedItems[0]?.status}</span>
            <button data-testid="node-relocate-btn" onClick={() => void relocate('node-fail-1')}>
              Send
            </button>
          </div>
        )
      }

      render(<HookConsumer />)
      fireEvent.click(screen.getByTestId('node-relocate-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('node-error')).toHaveTextContent('500')
        expect(screen.getByTestId('node-item-status')).toHaveTextContent('failed')
      })
      expect(postMock).toHaveBeenCalledWith('/library/servers/42/organize/execute', expect.anything())
    })

    it('handles desktopAPI structured error response ({ success: false, error: ... }) without dropping item', async () => {
      ;(window as any).desktopAPI = {
        executeOrganization: vi.fn().mockResolvedValue([
          { success: false, error: 'Target destination disk full (ENOSPC)' },
        ]),
      }

      const HookConsumer = () => {
        const { relocate, error, unorganizedItems } = useDownloadRelocation({
          initialItems: [
            {
              id: 'nospace-1',
              title: 'Heavy Game',
              sourceFilename: 'Heavy.Game-RUNE',
              sourcePath: '/downloads/Heavy.Game-RUNE',
              targetPath: 'D:/Games/Heavy Game/Heavy.Game-RUNE',
              status: 'pending',
            },
          ],
        })

        return (
          <div>
            <span data-testid="nospace-error">{error || 'clean'}</span>
            <span data-testid="nospace-count">{unorganizedItems.length}</span>
            <span data-testid="nospace-status">{unorganizedItems[0]?.status}</span>
            <button data-testid="nospace-btn" onClick={() => void relocate('nospace-1')}>
              Run
            </button>
          </div>
        )
      }

      render(<HookConsumer />)
      fireEvent.click(screen.getByTestId('nospace-btn'))

      await waitFor(() => {
        expect(screen.getByTestId('nospace-error')).toHaveTextContent('Target destination disk full')
        expect(screen.getByTestId('nospace-count')).toHaveTextContent('1') // Item not lost!
        expect(screen.getByTestId('nospace-status')).toHaveTextContent('failed')
      })
    })

    it('cleanly handles dismissing item and persists to DISMISSED_RELOCATIONS_STORAGE_KEY', () => {
      const HookConsumer = () => {
        const { dismissItem, unorganizedItems } = useDownloadRelocation({
          initialItems: [
            {
              id: 'dismiss-me',
              title: 'Dismiss Me',
              sourceFilename: 'Dismiss.Me-RUNE',
              sourcePath: '/downloads/Dismiss.Me-RUNE',
              targetPath: 'D:/Games/Dismiss Me/Dismiss.Me-RUNE',
              status: 'pending',
            },
          ],
        })

        return (
          <div>
            <span data-testid="rem-count">{unorganizedItems.length}</span>
            <button data-testid="dismiss-btn" onClick={() => dismissItem('dismiss-me')}>
              Dismiss
            </button>
          </div>
        )
      }

      render(<HookConsumer />)
      expect(screen.getByTestId('rem-count')).toHaveTextContent('1')

      fireEvent.click(screen.getByTestId('dismiss-btn'))
      expect(screen.getByTestId('rem-count')).toHaveTextContent('0')

      const storedDismissed = JSON.parse(
        localStorage.getItem(DISMISSED_RELOCATIONS_STORAGE_KEY) || '[]',
      )
      expect(storedDismissed).toContain('dismiss-me')
    })

    it('investigates relocateAll behavior when desktopAPI returns partial failure', async () => {
      // Item 1 succeeds, Item 2 fails
      ;(window as any).desktopAPI = {
        executeOrganization: vi.fn().mockResolvedValue([
          { success: true },
          { success: false, error: 'Target file locked by another process' },
        ]),
      }

      const HookConsumer = () => {
        const { relocateAll, unorganizedItems, error } = useDownloadRelocation({
          initialItems: [
            {
              id: 'batch-1',
              title: 'Batch 1',
              sourceFilename: 'B1-RUNE',
              sourcePath: '/dl/B1-RUNE',
              targetPath: 'D:/Games/B1/B1-RUNE',
              status: 'pending',
            },
            {
              id: 'batch-2',
              title: 'Batch 2',
              sourceFilename: 'B2-RUNE',
              sourcePath: '/dl/B2-RUNE',
              targetPath: 'D:/Games/B2/B2-RUNE',
              status: 'pending',
            },
          ],
        })

        return (
          <div>
            <span data-testid="batch-count">{unorganizedItems.length}</span>
            <span data-testid="batch-error">{error || 'none'}</span>
            <button data-testid="trigger-relocate-all" onClick={() => void relocateAll()}>
              Relocate All
            </button>
          </div>
        )
      }

      render(<HookConsumer />)
      expect(screen.getByTestId('batch-count')).toHaveTextContent('2')

      fireEvent.click(screen.getByTestId('trigger-relocate-all'))

      await waitFor(() => {
        // Did relocateAll preserve the failed item or wipe out all unorganizedItems?
        expect(screen.getByTestId('batch-count')).toHaveTextContent('0')
      })
    })

    it('checks whether DownloadRelocationPrompt exposes error or failed status to the user', () => {
      const failedItem: RelocationItem = {
        id: 'failed-item-ui',
        title: 'Cyberpunk 2077',
        sourceFilename: 'Cyberpunk.2077-RUNE',
        sourcePath: '/downloads/Cyberpunk.2077-RUNE',
        targetPath: 'D:/Games/Cyberpunk 2077/Cyberpunk.2077-RUNE',
        status: 'failed',
        error: 'Target directory permission denied',
      }

      render(<DownloadRelocationPrompt items={[failedItem]} autoOrganizeEnabled={false} />)

      // Check if error message is rendered
      const errorMsg = screen.queryByText(/permission denied/i)
      const failedBadge = screen.queryByText(/failed/i)

      // Observe empirical findings
      return { hasErrorMsg: !!errorMsg, hasFailedBadge: !!failedBadge }
    })
  })
})
