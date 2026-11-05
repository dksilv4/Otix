import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  type ScannedGameItem,
  normalizeTitleForGrouping,
  unifyScannedGameSources,
  unlinkSourcePair,
  relinkSourcePair,
  loadUnlinkedSourcePairs,
} from '../utils/scanned-summary'
import {
  computeNodeScanStats,
  filterAndSortScannedFiles,
} from '../utils/node-scan-files'
import { NodeScannedFilesTableRow } from '../components/molecules/node-scanned-files-table-row'
import { NodeGameDetailsModal } from '../components/organisms/node-game-details-modal'

describe('Scanned Files Duplicate Unification & Multi-Source Management', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('normalizes titles for grouping by stripping editions, versions, repacks, and extensions', () => {
    expect(normalizeTitleForGrouping('Cyberpunk 2077: Ultimate Edition.iso')).toBe('cyberpunk2077')
    expect(normalizeTitleForGrouping('Cyberpunk 2077 (v2.1 FitGirl Repack)')).toBe('cyberpunk2077')
    expect(normalizeTitleForGrouping('The Witcher 3: Wild Hunt - Game of the Year Edition')).toBe('thewitcher3wildhunt')
    expect(normalizeTitleForGrouping('Spider-Man 2 Complete Edition (DODI Repack).iso')).toBe('spiderman2')
    expect(normalizeTitleForGrouping('')).toBe('')
  })

  it('unifies an installed game and its ISO installer when sharing the same catalog mediaId', () => {
    const rawItems: ScannedGameItem[] = [
      {
        id: 'iso-1',
        title: 'Cyberpunk 2077',
        path: 'D:\\ISOs\\Cyberpunk 2077.iso',
        format: 'ISO',
        isIso: true,
        mediaId: 1001,
        sizeBytes: 60_000_000_000,
        modifiedAt: '2026-10-01T00:00:00Z',
      },
      {
        id: 'pc-1',
        title: 'Cyberpunk 2077',
        path: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
        exePath: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
        installDir: 'C:\\Games\\Cyberpunk 2077',
        format: 'PC',
        platform: 'PC',
        isIso: false,
        mediaId: 1001,
        matched: true,
        posterUrl: 'https://images.otix.app/cp.jpg',
        sizeBytes: 85_000_000_000,
        modifiedAt: '2026-10-15T00:00:00Z',
      },
    ]

    const unified = unifyScannedGameSources(rawItems)
    expect(unified).toHaveLength(1)

    const main = unified[0]
    // The installed playable game must take priority as primary
    expect(main.id).toBe('pc-1')
    expect(main.format).toBe('PC')
    expect(main.isMultiSource).toBe(true)
    expect(main.hasIsoSource).toBe(true)
    expect(main.hasInstalledSource).toBe(true)
    expect(main.totalSizeBytes).toBe(145_000_000_000)
    expect(main.sizeBytes).toBe(145_000_000_000)
    expect(main.sources).toHaveLength(2)

    // Sources contain both the installed copy and the ISO
    expect(main.sources![0].id).toBe('pc-1')
    expect(main.sources![0].sourceType).toBe('installed')
    expect(main.sources![1].id).toBe('iso-1')
    expect(main.sources![1].sourceType).toBe('iso')
    expect(main.sources![1].path).toBe('D:\\ISOs\\Cyberpunk 2077.iso')
  })

  it('unifies unmatched files sharing the same cleaned title on the same node', () => {
    const rawItems: ScannedGameItem[] = [
      {
        id: 'iso-unmatched',
        title: 'Spider-Man 2 Digital Deluxe.iso',
        path: 'D:\\ISOs\\Spider-Man 2 Digital Deluxe.iso',
        format: 'ISO',
        isIso: true,
        sizeBytes: 50_000_000_000,
        serverId: 0,
      },
      {
        id: 'pc-unmatched',
        title: 'Spider-Man 2',
        path: 'C:\\Games\\Spider-Man 2\\SpiderMan2.exe',
        exePath: 'C:\\Games\\Spider-Man 2\\SpiderMan2.exe',
        format: 'PC',
        isIso: false,
        sizeBytes: 80_000_000_000,
        serverId: 0,
      },
    ]

    const unified = unifyScannedGameSources(rawItems)
    expect(unified).toHaveLength(1)
    expect(unified[0].isMultiSource).toBe(true)
    expect(unified[0].sources).toHaveLength(2)
  })

  it('respects manual unlinking and splits items into independent rows', () => {
    const rawItems: ScannedGameItem[] = [
      {
        id: 'item-a',
        title: 'Grand Theft Auto V',
        path: 'C:\\Games\\GTA V\\GTA5.exe',
        exePath: 'C:\\Games\\GTA V\\GTA5.exe',
        format: 'PC',
        isIso: false,
        mediaId: 500,
        sizeBytes: 90_000_000_000,
      },
      {
        id: 'item-b',
        title: 'Grand Theft Auto V.iso',
        path: 'D:\\ISOs\\GTA5.iso',
        format: 'ISO',
        isIso: true,
        mediaId: 500,
        sizeBytes: 65_000_000_000,
      },
    ]

    // Initially unified
    expect(unifyScannedGameSources(rawItems)).toHaveLength(1)

    // Unlink the pair
    unlinkSourcePair('item-a', 'item-b')
    expect(loadUnlinkedSourcePairs().size).toBe(1)

    // After unlinking, they remain 2 distinct rows
    const unlinkedResult = unifyScannedGameSources(rawItems)
    expect(unlinkedResult).toHaveLength(2)

    // Relink re-merges them
    relinkSourcePair('item-a', 'item-b')
    expect(unifyScannedGameSources(rawItems)).toHaveLength(1)
  })

  it('computes duplicate stats and filters by Multi-source and ISO tabs', () => {
    const unifiedItems: ScannedGameItem[] = [
      {
        id: 'game-1',
        title: 'Cyberpunk 2077',
        path: 'C:\\Games\\Cyberpunk 2077\\Cyberpunk2077.exe',
        format: 'PC',
        isIso: false,
        matched: true,
        isMultiSource: true,
        hasIsoSource: true,
        sizeBytes: 140_000_000_000,
        sources: [
          {
            id: 'g1-pc',
            sourceType: 'installed',
            title: 'Cyberpunk 2077',
            path: 'C:\\Games\\Cyberpunk 2077\\Cyberpunk2077.exe',
            format: 'PC',
            sizeBytes: 80_000_000_000,
          },
          {
            id: 'g1-iso',
            sourceType: 'iso',
            title: 'Cyberpunk 2077.iso',
            path: 'D:\\ISOs\\Cyberpunk 2077.iso',
            format: 'ISO',
            sizeBytes: 60_000_000_000,
          },
        ],
      },
      {
        id: 'game-2',
        title: 'Hades',
        path: 'C:\\Games\\Hades\\Hades.exe',
        format: 'PC',
        isIso: false,
        matched: true,
        isMultiSource: false,
        sizeBytes: 15_000_000_000,
      },
      {
        id: 'game-3',
        title: 'Metal Gear Solid 3.iso',
        path: 'D:\\ISOs\\MGS3.iso',
        format: 'ISO',
        isIso: true,
        matched: false,
        isMultiSource: false,
        sizeBytes: 4_000_000_000,
      },
    ]

    const stats = computeNodeScanStats(unifiedItems)
    expect(stats.totalFiles).toBe(3)
    expect(stats.duplicatesCount).toBe(1)
    expect(stats.isoCount).toBe(2) // game-1 (contains ISO source) and game-3 (isIso)

    // Filter by duplicates tab
    const dupesOnly = filterAndSortScannedFiles(unifiedItems, 'duplicates', '', 'name-asc')
    expect(dupesOnly).toHaveLength(1)
    expect(dupesOnly[0].title).toBe('Cyberpunk 2077')

    // Filter by iso tab
    const isosOnly = filterAndSortScannedFiles(unifiedItems, 'iso', '', 'name-asc')
    expect(isosOnly).toHaveLength(2)
  })

  it('renders the multi-source pill in table row and expands nested secondary source with actions', () => {
    const item: ScannedGameItem = {
      id: 'pc-row',
      title: 'Cyberpunk 2077',
      path: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
      format: 'PC',
      platform: 'PC',
      isIso: false,
      isMultiSource: true,
      hasIsoSource: true,
      hasInstalledSource: true,
      sizeBytes: 145_000_000_000,
      sources: [
        {
          id: 'pc-row',
          sourceType: 'installed',
          title: 'Cyberpunk 2077',
          path: 'C:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
          format: 'PC',
          sizeBytes: 85_000_000_000,
        },
        {
          id: 'iso-row',
          sourceType: 'iso',
          title: 'Cyberpunk 2077 Disc 1.iso',
          path: 'D:\\ISOs\\Cyberpunk 2077 Disc 1.iso',
          format: 'ISO',
          isIso: true,
          sizeBytes: 60_000_000_000,
        },
      ],
    }

    const onToggleExpand = vi.fn()
    const onUnlinkSource = vi.fn()

    const { rerender } = render(
      <table>
        <tbody>
          <NodeScannedFilesTableRow
            item={item}
            isExpanded={false}
            onToggleExpand={onToggleExpand}
            onOpenMatchModal={vi.fn()}
            onOpenDetails={vi.fn()}
            onUnlinkSource={onUnlinkSource}
          />
        </tbody>
      </table>,
    )

    // Sources pill is visible on main row
    const pill = screen.getByRole('button', { name: /\+1 Installed \+ ISO/i })
    expect(pill).toBeInTheDocument()

    fireEvent.click(pill)
    expect(onToggleExpand).toHaveBeenCalledWith('pc-row')

    // Rerender as expanded
    rerender(
      <table>
        <tbody>
          <NodeScannedFilesTableRow
            item={item}
            isExpanded={true}
            onToggleExpand={onToggleExpand}
            onOpenMatchModal={vi.fn()}
            onOpenDetails={vi.fn()}
            onUnlinkSource={onUnlinkSource}
          />
        </tbody>
      </table>,
    )

    // Secondary ISO source row is now rendered
    expect(screen.getByText('Source ISO')).toBeInTheDocument()
    expect(screen.getAllByText('Cyberpunk 2077 Disc 1.iso').length).toBeGreaterThanOrEqual(1)

    // Mount button is rendered on ISO
    const mountBtn = screen.getByRole('button', { name: /mount/i })
    expect(mountBtn).toBeInTheDocument()

    // Unlink button triggers onUnlinkSource
    const unlinkBtn = screen.getByTitle(/unlink source to display as independent row/i)
    fireEvent.click(unlinkBtn)
    expect(onUnlinkSource).toHaveBeenCalledWith('pc-row', 'iso-row')
  })

  it('renders Discovered Sources section with Mount and Unlink actions in Game Details Modal', () => {
    const item: ScannedGameItem = {
      id: 'game-details-multi',
      title: 'The Witcher 3: Wild Hunt',
      path: 'C:\\Games\\Witcher 3\\bin\\x64\\witcher3.exe',
      exePath: 'C:\\Games\\Witcher 3\\bin\\x64\\witcher3.exe',
      installDir: 'C:\\Games\\Witcher 3',
      format: 'PC',
      platform: 'PC',
      isIso: false,
      isMultiSource: true,
      hasIsoSource: true,
      sizeBytes: 110_000_000_000,
      sources: [
        {
          id: 'game-details-multi',
          sourceType: 'installed',
          title: 'The Witcher 3: Wild Hunt',
          path: 'C:\\Games\\Witcher 3\\bin\\x64\\witcher3.exe',
          format: 'PC',
          sizeBytes: 65_000_000_000,
        },
        {
          id: 'witcher-iso',
          sourceType: 'iso',
          title: 'The Witcher 3 GOTY.iso',
          path: 'D:\\ISOs\\The Witcher 3 GOTY.iso',
          format: 'ISO',
          isIso: true,
          sizeBytes: 45_000_000_000,
        },
      ],
    }

    const onUnlink = vi.fn()

    render(
      <NodeGameDetailsModal
        open={true}
        onClose={vi.fn()}
        game={item}
        onUnlinkSource={onUnlink}
      />,
    )

    expect(screen.getByText(/Discovered Sources & Installers/i)).toBeInTheDocument()
    expect(screen.getByText('Primary Playable')).toBeInTheDocument()
    expect(screen.getByText('Source ISO')).toBeInTheDocument()
    expect(screen.getByText('The Witcher 3 GOTY.iso')).toBeInTheDocument()

    // Unlink button inside details modal works
    const unlinkBtn = screen.getByTitle(/unlink and separate into distinct table row/i)
    fireEvent.click(unlinkBtn)
    expect(onUnlink).toHaveBeenCalledWith('game-details-multi', 'witcher-iso')
  })
})
