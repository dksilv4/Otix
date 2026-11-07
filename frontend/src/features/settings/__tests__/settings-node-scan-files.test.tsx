import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  computeNodeScanStats,
  filterAndSortScannedFiles,
  paginateScannedFiles,
  getFileFormatBadge,
  formatScanSize,
  formatScanDate,
  splitPathForDisplay,
  resolvePlatformLabel,
  resolveItemVersion,
  getNextSortOption,
  getColumnSortState,
  groupGamesAndUpdates,
  DEFAULT_VISIBLE_COLUMNS,
} from '../utils/node-scan-files'
import {
  buildThemeFromColors,
  hexToRgb,
  rgbToHsl,
  hslToRgb,
} from '../utils/node-scan-palette'
import type { ScannedGameItem } from '../utils/scanned-summary'
import { NodeScannedFilesTable } from '../components/organisms/node-scanned-files-table'
import { NodeScannedFilesTableRow } from '../components/molecules/node-scanned-files-table-row'
import { NodeScanPathsCard } from '../components/molecules/node-scan-paths-card'
import { NodeAddFolderModal } from '../components/organisms/node-add-folder-modal'
import { isLocalDesktopNode } from '../local-desktop-node'
import type { GameServer } from '@/features/downloads/types'
import { NodeGameDetailsModal } from '../components/organisms/node-game-details-modal'
import { NodeScanColumnSettings } from '../components/molecules/node-scan-column-settings'

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

const mockFiles: ScannedGameItem[] = [
  {
    id: 1,
    title: 'Cyberpunk 2077',
    path: 'D:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe',
    format: 'EXE',
    platform: 'PC',
    isIso: false,
    matched: true,
    confidence: 0.98,
    releaseYear: 2020,
    sizeBytes: 75_000_000_000,
    modifiedAt: '2026-10-15T12:00:00Z',
    backdropUrl: 'https://images.otix.app/cyberpunk-backdrop.jpg',
    updates: [
      {
        id: 'cp-upd-1',
        title: 'Patch 2.1',
        path: 'D:\\Games\\Cyberpunk 2077\\Updates\\patch_2.1.exe',
        format: 'UPDATE',
        isIso: false,
        isUpdate: true,
        sizeBytes: 15_000_000_000,
        modifiedAt: '2026-10-20T12:00:00Z',
      },
    ],
  },
  {
    id: 2,
    title: 'Gran Turismo 4',
    path: 'D:\\ISOs\\PS2\\Gran Turismo 4.iso',
    format: 'ISO',
    platform: 'PS2',
    isIso: true,
    matched: true,
    confidence: 1.0,
    releaseYear: 2004,
    sizeBytes: 4_300_000_000,
    modifiedAt: '2026-09-01T08:00:00Z',
  },
  {
    id: 3,
    title: 'setup-v1.2.exe',
    path: 'D:\\Downloads\\Unsorted\\setup-v1.2.exe',
    format: 'EXE',
    isIso: false,
    matched: false,
    confidence: null,
    releaseYear: null,
    sizeBytes: 500_000_000,
    modifiedAt: '2026-11-01T15:30:00Z',
  },
]

describe('node-scan-files utils', () => {
  it('computes scan statistics correctly', () => {
    const stats = computeNodeScanStats(mockFiles)
    expect(stats.totalFiles).toBe(3)
    expect(stats.matchedCount).toBe(2)
    expect(stats.unmatchedCount).toBe(1)
    expect(stats.isoCount).toBe(1)
    expect(stats.totalSizeBytes).toBe(79_800_000_000)
  })

  it('filters by status tab', () => {
    const all = filterAndSortScannedFiles(mockFiles, 'all', '', 'name-asc')
    expect(all.length).toBe(3)

    const matched = filterAndSortScannedFiles(mockFiles, 'matched', '', 'name-asc')
    expect(matched.length).toBe(2)
    expect(matched.map((m) => m.title)).toEqual(['Cyberpunk 2077', 'Gran Turismo 4'])

    const unmatched = filterAndSortScannedFiles(mockFiles, 'unmatched', '', 'name-asc')
    expect(unmatched.length).toBe(1)
    expect(unmatched[0].title).toBe('setup-v1.2.exe')

    const isos = filterAndSortScannedFiles(mockFiles, 'iso', '', 'name-asc')
    expect(isos.length).toBe(1)
    expect(isos[0].title).toBe('Gran Turismo 4')
  })

  it('filters by search query across title, path, platform, and format', () => {
    const searchTitle = filterAndSortScannedFiles(mockFiles, 'all', 'cyber', 'name-asc')
    expect(searchTitle.length).toBe(1)
    expect(searchTitle[0].title).toBe('Cyberpunk 2077')

    const searchPath = filterAndSortScannedFiles(mockFiles, 'all', 'PS2', 'name-asc')
    expect(searchPath.length).toBe(1)
    expect(searchPath[0].title).toBe('Gran Turismo 4')

    const searchPlatform = filterAndSortScannedFiles(mockFiles, 'all', 'ps2', 'name-asc')
    expect(searchPlatform.length).toBe(1)

    const searchFormat = filterAndSortScannedFiles(mockFiles, 'all', 'iso', 'name-asc')
    expect(searchFormat.length).toBe(1)
  })

  it('sorts files by name, size, date, platform, and status', () => {
    const sortSizeDesc = filterAndSortScannedFiles(mockFiles, 'all', '', 'size-desc')
    expect(sortSizeDesc[0].title).toBe('Cyberpunk 2077')
    expect(sortSizeDesc[2].title).toBe('setup-v1.2.exe')

    const sortSizeAsc = filterAndSortScannedFiles(mockFiles, 'all', '', 'size-asc')
    expect(sortSizeAsc[0].title).toBe('setup-v1.2.exe')

    const sortDateDesc = filterAndSortScannedFiles(mockFiles, 'all', '', 'date-desc')
    expect(sortDateDesc[0].title).toBe('setup-v1.2.exe')

    const sortStatus = filterAndSortScannedFiles(mockFiles, 'all', '', 'status-desc')
    expect(sortStatus[0].matched).toBe(true)
    expect(sortStatus[2].matched).toBe(false)

    const sortPlatform = filterAndSortScannedFiles(mockFiles, 'all', '', 'platform-asc')
    expect(sortPlatform.map((p) => resolvePlatformLabel(p))).toContain('PS2')
  })

  it('resolves platform labels and sort transitions accurately', () => {
    expect(resolvePlatformLabel(mockFiles[0])).toBe('PC')
    expect(resolvePlatformLabel(mockFiles[1])).toBe('PS2')

    expect(getNextSortOption('name', 'name-asc')).toBe('name-desc')
    expect(getNextSortOption('name', 'name-desc')).toBe('name-asc')
    expect(getNextSortOption('platform', 'name-asc')).toBe('platform-asc')
    expect(getNextSortOption('size', 'size-desc')).toBe('size-asc')
    expect(getColumnSortState('name', 'name-asc')).toBe('asc')
    expect(getColumnSortState('name', 'name-desc')).toBe('desc')
    expect(getColumnSortState('size', 'name-asc')).toBe(null)
  })

  it('groups game updates under parent game', () => {
    const raw: ScannedGameItem[] = [
      {
        id: 10,
        title: 'The Witcher 3',
        path: 'D:\\Games\\Witcher 3\\bin\\witcher3.exe',
        format: 'EXE',
        isIso: false,
      },
      {
        id: 11,
        title: 'Patch 1.32',
        path: 'D:\\Games\\Witcher 3\\Updates\\patch_1.32.exe',
        format: 'UPDATE',
        isIso: false,
      },
    ]

    const grouped = groupGamesAndUpdates(raw)
    expect(grouped.length).toBe(1)
    expect(grouped[0].title).toBe('The Witcher 3')
    expect(grouped[0].updates?.length).toBe(1)
    expect(grouped[0].updates?.[0].title).toBe('Patch 1.32')
  })

  it('paginates scanned files list properly', () => {
    const paged = paginateScannedFiles(mockFiles, 1, 2)
    expect(paged.pagedItems.length).toBe(2)
    expect(paged.totalPages).toBe(2)
    expect(paged.startIndex).toBe(0)
    expect(paged.endIndex).toBe(2)

    const paged2 = paginateScannedFiles(mockFiles, 2, 2)
    expect(paged2.pagedItems.length).toBe(1)
    expect(paged2.startIndex).toBe(2)
    expect(paged2.endIndex).toBe(3)
  })

  it('extracts format badges, formats sizes, and splits paths', () => {
    expect(getFileFormatBadge(mockFiles[0]).label).toBe('EXE')
    expect(getFileFormatBadge(mockFiles[1]).label).toBe('ISO')

    expect(formatScanSize(1024 * 1024 * 50)).toContain('50')
    expect(formatScanSize(0)).toBe('—')

    expect(formatScanDate('2026-10-15T12:00:00Z')).toContain('2026')
    expect(formatScanDate(null)).toBe('—')

    const split = splitPathForDisplay('D:\\Games\\Cyberpunk 2077\\bin\\x64\\Cyberpunk2077.exe')
    expect(split.filename).toBe('Cyberpunk2077.exe')
    expect(split.dir).toBe('D:\\Games\\Cyberpunk 2077\\bin\\x64\\')
  })
})

describe('node-scan-palette utils', () => {
  it('converts RGB to HSL and back accurately', () => {
    const [h, s, l] = rgbToHsl(255, 0, 0)
    expect(h).toBe(0)
    expect(s).toBe(100)
    expect(l).toBe(50)

    const [r, g, b] = hslToRgb(0, 100, 50)
    expect(r).toBe(255)
    expect(g).toBe(0)
    expect(b).toBe(0)
  })

  it('parses hex colors to RGB', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0])
    expect(hexToRgb('00ff00')).toEqual([0, 255, 0])
    expect(hexToRgb(null)).toBeNull()
  })

  it('builds vibrant theme with backdrop image style and dark surface tint', () => {
    const theme = buildThemeFromColors([20, 120, 240], null, 'https://images.otix.app/art.jpg')
    expect(theme.accentColor).toContain('rgb')
    expect(theme.rowStyle.backgroundImage).toContain('https://images.otix.app/art.jpg')
    expect(theme.rowStyle.backgroundSize).toBe('cover')
  })
})

describe('NodeScannedFilesTable component', () => {
  const defaultProps = {
    files: mockFiles,
    totalFiles: 3,
    searchQuery: '',
    onSearchChange: vi.fn(),
    filterTab: 'all' as const,
    onFilterTabChange: vi.fn(),
    sortOption: 'name-asc' as const,
    onSortChange: vi.fn(),
    page: 1,
    onPageChange: vi.fn(),
    pageSize: 25,
    onPageSizeChange: vi.fn(),
    totalPages: 1,
    startIndex: 0,
    endIndex: 3,
    isLoading: false,
    isScanning: false,
    onTriggerScan: vi.fn(),
    onOpenMatchModal: vi.fn(),
    onOpenDetails: vi.fn(),
    stats: computeNodeScanStats(mockFiles),
  }

  it('renders table headers and rows with platform and focused file names', () => {
    render(<NodeScannedFilesTable {...defaultProps} />)
    expect(screen.getByText('Cyberpunk 2077')).toBeDefined()
    expect(screen.getByText('Gran Turismo 4')).toBeDefined()
    expect(screen.getAllByText('setup-v1.2.exe').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cyberpunk2077.exe').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Gran Turismo 4.iso').length).toBeGreaterThan(0)

    // Platform column badges
    expect(screen.getAllByText('PC').length).toBeGreaterThan(0)
    expect(screen.getByText('PS2')).toBeDefined()
  })

  it('allows sorting by clicking column headers', () => {
    const onSort = vi.fn()
    render(<NodeScannedFilesTable {...defaultProps} onSortChange={onSort} />)

    const titleHeader = screen.getByRole('button', { name: /file \/ title/i })
    fireEvent.click(titleHeader)
    expect(onSort).toHaveBeenCalledWith('name-desc')

    const platformHeader = screen.getByRole('button', { name: /platform/i })
    fireEvent.click(platformHeader)
    expect(onSort).toHaveBeenCalledWith('platform-asc')

    const sizeHeader = screen.getByRole('button', { name: /size/i })
    fireEvent.click(sizeHeader)
    expect(onSort).toHaveBeenCalledWith('size-desc')
  })

  it('expands row to show secondary update rows when clicking updates toggle', () => {
    render(<NodeScannedFilesTable {...defaultProps} />)

    // Check updates pill
    const updatePill = screen.getByRole('button', { name: /\+1 update/i })
    expect(updatePill).toBeDefined()

    // Expand
    fireEvent.click(updatePill)

    // Secondary row appears
    expect(screen.getByText('Patch 2.1')).toBeDefined()
    expect(screen.getAllByText('patch_2.1.exe').length).toBeGreaterThan(0)
  })

  it('opens details modal when clicking row to access actions including match', () => {
    render(<NodeScannedFilesTable {...defaultProps} />)
    const rowTitle = screen.getByText('Cyberpunk 2077')
    fireEvent.click(rowTitle)
    expect(defaultProps.onOpenDetails).toHaveBeenCalledWith(mockFiles[0])
  })

  it('does not throw Rules of Hooks error when transitioning an unmatched game to matched', () => {
    const unmatchedGame: ScannedGameItem = {
      id: 99,
      title: 'Unmatched Game',
      path: 'D:\\Games\\Unmatched\\game.exe',
      format: 'EXE',
      isIso: false,
      matched: false,
    }

    const { rerender } = render(
      <table>
        <tbody>
          <NodeScannedFilesTableRow
            item={unmatchedGame}
            isExpanded={false}
            onToggleExpand={vi.fn()}
            onOpenMatchModal={vi.fn()}
            onOpenDetails={vi.fn()}
          />
        </tbody>
      </table>,
    )

    // Match the game and rerender
    const matchedGame: ScannedGameItem = {
      ...unmatchedGame,
      matched: true,
      backdropUrl: 'https://images.otix.app/matched.jpg',
    }

    expect(() => {
      rerender(
        <table>
          <tbody>
            <NodeScannedFilesTableRow
              item={matchedGame}
              isExpanded={false}
              onToggleExpand={vi.fn()}
              onOpenMatchModal={vi.fn()}
              onOpenDetails={vi.fn()}
            />
          </tbody>
        </table>,
      )
    }).not.toThrow()
  })
})

describe('NodeScanPathsCard component', () => {
  const paths = [
    { path: 'D:\\Games', type: 'game' as const },
    { path: 'E:\\ISOs', type: 'iso' as const },
  ]

  it('renders monitored folders and triggers modal', () => {
    const queryClient = createTestQueryClient()
    const onRemove = vi.fn()
    const onAdd = vi.fn()
    const onScan = vi.fn()

    render(
      <QueryClientProvider client={queryClient}>
        <NodeScanPathsCard
          scanPaths={paths}
          isLoadingPaths={false}
          isScanning={false}
          onAddPath={onAdd}
          onRemovePath={onRemove}
          onScanSinglePath={onScan}
          nodeName="Local Node"
          desktop={true}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('Monitored Folders')).toBeDefined()
    expect(screen.getByText('Games')).toBeDefined()
    expect(screen.getByText('ISOs')).toBeDefined()

    const addBtn = screen.getByRole('button', { name: /add folder/i })
    fireEvent.click(addBtn)
    expect(screen.getByText('Add Monitored Folder')).toBeDefined()
  })
})

describe('Platform resolution and version extraction', () => {
  it('never returns ISO as platform for iso files, correctly identifying consoles or defaulting to PC', () => {
    // Legacy ISO item with platform: 'iso'
    const legacyIso: ScannedGameItem = {
      id: 101,
      title: 'Random Game',
      path: 'D:\\ISOs\\RandomGame.iso',
      format: 'ISO',
      platform: 'iso',
      isIso: true,
    }
    expect(resolvePlatformLabel(legacyIso)).toBe('PC')

    // ISO item inside PS2 directory
    const ps2Iso: ScannedGameItem = {
      id: 102,
      title: 'God of War II',
      path: 'E:\\Emulation\\PS2\\God of War II.iso',
      format: 'ISO',
      isIso: true,
    }
    expect(resolvePlatformLabel(ps2Iso)).toBe('PS2')

    // Switch ROM with .nsp extension
    const switchRom: ScannedGameItem = {
      id: 103,
      title: 'Super Mario Odyssey',
      path: 'D:\\Roms\\Super Mario Odyssey.nsp',
      format: 'NSP',
      isIso: false,
    }
    expect(resolvePlatformLabel(switchRom)).toBe('Switch')

    // GameCube disc with .rvz extension
    const gcRom: ScannedGameItem = {
      id: 104,
      title: 'Super Smash Bros Melee',
      path: 'D:\\Roms\\GameCube\\Melee.rvz',
      format: 'RVZ',
      isIso: false,
    }
    expect(resolvePlatformLabel(gcRom)).toBe('GameCube')
  })

  it('extracts item versions from title, filename, path, or explicit version field', () => {
    expect(
      resolveItemVersion({
        id: 1,
        title: 'Cyberpunk 2077 v2.1',
        path: 'D:\\Games\\Cyberpunk 2077\\Cyberpunk2077.exe',
        format: 'EXE',
        isIso: false,
      }),
    ).toBe('v2.1')

    expect(
      resolveItemVersion({
        id: 2,
        title: 'setup-v1.2.exe',
        path: 'D:\\Downloads\\setup-v1.2.exe',
        format: 'EXE',
        isIso: false,
      }),
    ).toBe('v1.2')

    expect(
      resolveItemVersion({
        id: 3,
        title: 'patch_1.32.exe',
        path: 'D:\\Games\\Witcher\\Updates\\patch_1.32.exe',
        format: 'EXE',
        isIso: false,
      }),
    ).toBe('v1.32')

    expect(
      resolveItemVersion({
        id: 4,
        title: 'Gran Turismo 4',
        path: 'D:\\ISOs\\Gran Turismo 4.iso',
        format: 'ISO',
        isIso: true,
      }),
    ).toBeNull()

    expect(
      resolveItemVersion({
        id: 5,
        title: 'Game',
        path: 'D:\\Games\\game.exe',
        format: 'EXE',
        isIso: false,
        version: '3.0.1',
      }),
    ).toBe('v3.0.1')

    // Does not falsely extract version from ancestor path or IP addresses
    expect(
      resolveItemVersion({
        id: 6,
        title: 'Hades',
        path: '\\\\192.168.1.100\\Games\\v1.0\\Hades\\Hades.exe',
        format: 'EXE',
        isIso: false,
      }),
    ).toBeNull()

    // Correctly extracts version from leaf game folder name
    expect(
      resolveItemVersion({
        id: 7,
        title: 'The Witcher 3',
        path: 'D:\\Games\\The Witcher 3 [1.32]\\bin\\x64\\witcher3.exe',
        format: 'EXE',
        isIso: false,
      }),
    ).toBe('v1.32')

    // Correctly extracts version from linked updates
    expect(
      resolveItemVersion({
        id: 8,
        title: 'Elden Ring',
        path: 'D:\\Games\\Elden Ring\\eldenring.exe',
        format: 'EXE',
        isIso: false,
        updates: [
          {
            id: 'upd-8',
            title: 'Patch 1.12.3',
            path: 'D:\\Games\\Elden Ring\\Updates\\patch_1.12.3.exe',
            format: 'UPDATE',
            isIso: false,
            isUpdate: true,
          },
        ],
      }),
    ).toBe('v1.12.3')
  })
})

describe('NodeGameDetailsModal component', () => {
  const sampleGame: ScannedGameItem = {
    id: 'game-42',
    title: 'The Witcher 3: Wild Hunt',
    path: 'D:\\Games\\The Witcher 3\\bin\\x64\\witcher3.exe',
    format: 'EXE',
    platform: 'PC',
    isIso: false,
    matched: true,
    confidence: 0.99,
    releaseYear: 2015,
    sizeBytes: 52_000_000_000,
    modifiedAt: '2026-10-15T10:00:00Z',
    overview: 'A monster hunter embarks on an epic quest in a war-torn world.',
    backdropUrl: 'https://images.otix.app/witcher-backdrop.jpg',
    updates: [
      {
        id: 'upd-1',
        title: 'Next Gen Patch 4.04',
        path: 'D:\\Games\\The Witcher 3\\Updates\\patch_4.04.exe',
        format: 'UPDATE',
        isIso: false,
        isUpdate: true,
        sizeBytes: 8_000_000_000,
        modifiedAt: '2026-10-18T10:00:00Z',
      },
    ],
  }

  it('renders complete game specifications, matched file, updates, and triggers match modal', () => {
    const onOpenMatch = vi.fn()
    const onClose = vi.fn()

    render(
      <NodeGameDetailsModal
        open={true}
        onClose={onClose}
        game={sampleGame}
        onOpenMatch={onOpenMatch}
      />,
    )

    expect(screen.getByText('The Witcher 3: Wild Hunt')).toBeDefined()
    expect(screen.getAllByText('witcher3.exe').length).toBeGreaterThan(0)
    expect(screen.getByText('D:\\Games\\The Witcher 3\\bin\\x64\\witcher3.exe')).toBeDefined()
    expect(screen.getByText(new RegExp(formatScanSize(sampleGame.sizeBytes), 'i'))).toBeDefined()
    expect(screen.getByText(/Linked Updates & Patches \(1\)/i)).toBeDefined()
    expect(screen.getByText('Next Gen Patch 4.04')).toBeDefined()

    const matchBtn = screen.getByRole('button', { name: /edit match & platform/i })
    fireEvent.click(matchBtn)
    expect(onOpenMatch).toHaveBeenCalledWith(sampleGame)
  })
})

describe('NodeScanColumnSettings component', () => {
  it('allows toggling columns on and off and resetting', () => {
    const onToggle = vi.fn()
    const onReset = vi.fn()

    render(
      <NodeScanColumnSettings
        visibleColumns={DEFAULT_VISIBLE_COLUMNS}
        onToggleColumn={onToggle}
        onResetColumns={onReset}
      />,
    )

    // Open settings popover
    const triggerBtn = screen.getByRole('button', { name: /customize visible columns/i })
    fireEvent.click(triggerBtn)

    expect(screen.getByText('Visible Columns')).toBeDefined()
    expect(screen.getByText('Version')).toBeDefined()
    expect(screen.getByText('Platform')).toBeDefined()

    // Toggle Version
    const versionToggle = screen.getByRole('button', { name: /version/i })
    fireEvent.click(versionToggle)
    expect(onToggle).toHaveBeenCalledWith('version')

    // Click Reset
    const resetBtn = screen.getByRole('button', { name: /reset/i })
    fireEvent.click(resetBtn)
    expect(onReset).toHaveBeenCalled()
  })
})

describe('Row click and header behavior in NodeScannedFilesTable', () => {
  it('opens details modal when clicking row, and hides Icon label in header', () => {
    const onOpenDetails = vi.fn()
    const defaultProps = {
      files: mockFiles,
      totalFiles: 3,
      searchQuery: '',
      onSearchChange: vi.fn(),
      filterTab: 'all' as const,
      onFilterTabChange: vi.fn(),
      sortOption: 'name-asc' as const,
      onSortChange: vi.fn(),
      page: 1,
      onPageChange: vi.fn(),
      pageSize: 25,
      onPageSizeChange: vi.fn(),
      totalPages: 1,
      startIndex: 0,
      endIndex: 3,
      isLoading: false,
      isScanning: false,
      onTriggerScan: vi.fn(),
      onOpenMatchModal: vi.fn(),
      onOpenDetails,
      stats: computeNodeScanStats(mockFiles),
    }

    render(<NodeScannedFilesTable {...defaultProps} />)

    // Header does NOT contain text "Icon", but hosts the column settings button in the first cell
    const headerCells = screen.getAllByRole('columnheader')
    expect(headerCells[0].textContent).toBe('')
    expect(within(headerCells[0]).getByRole('button', { name: /customize visible columns/i })).toBeDefined()

    // Header contains Version column
    expect(screen.getByRole('button', { name: /version/i })).toBeDefined()

    // Click directly on row to open details modal
    const rowTitle = screen.getByText('Cyberpunk 2077')
    fireEvent.click(rowTitle)
    expect(onOpenDetails).toHaveBeenCalledWith(mockFiles[0])
  })
})

describe('NodeAddFolderModal node selection & browse target', () => {
  const mockServers: GameServer[] = [
    {
      id: 1,
      name: 'My Desktop',
      isLocalDesktop: true,
      isOnline: true,
      isActive: true,
      primaryUrl: 'http://127.0.0.1:8090',
      localUrl: 'http://127.0.0.1:8090',
      totalFiles: 10,
      storageFreeBytes: 1000,
      storageTotalBytes: 5000,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 2,
      name: 'NAS Server',
      isLocalDesktop: false,
      isOnline: true,
      isActive: false,
      primaryUrl: 'http://192.168.1.100:8090',
      localUrl: 'http://192.168.1.100:8090',
      totalFiles: 50,
      storageFreeBytes: 5000,
      storageTotalBytes: 10000,
      createdAt: '',
      updatedAt: '',
    },
  ]

  it('recognizes is_local in isLocalDesktopNode', () => {
    expect(isLocalDesktopNode({ id: 99, is_local: true })).toBe(true)
    expect(isLocalDesktopNode({ id: 98, isLocal: true })).toBe(true)
    expect(isLocalDesktopNode({ id: 97, primaryUrl: 'http://127.0.0.1:8090' })).toBe(true)
    expect(isLocalDesktopNode({ id: 96, primaryUrl: 'http://192.168.1.200:8090' })).toBe(false)
  })

  it('renders node dropdown when multiple servers available and auto-selects last selected', () => {
    localStorage.setItem('otix:last-add-folder-node-id', '2')
    const onAddPath = vi.fn().mockResolvedValue(undefined)

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <NodeAddFolderModal
          open={true}
          onClose={vi.fn()}
          onAddPath={onAddPath}
          servers={mockServers}
          currentNodeId={1}
          desktop={true}
        />
      </QueryClientProvider>
    )

    // Target Node label should be present
    expect(screen.getByText('Target Node')).toBeInTheDocument()

    // Add Folder button is disabled when path is empty
    const submitBtn = screen.getByRole('button', { name: /add folder/i })
    expect(submitBtn).toBeDisabled()
  })

  it('auto-selects the only available node when only one server is present', () => {
    const singleServer = [mockServers[0]]
    const onAddPath = vi.fn().mockResolvedValue(undefined)

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <NodeAddFolderModal
          open={true}
          onClose={vi.fn()}
          onAddPath={onAddPath}
          servers={singleServer}
          desktop={true}
        />
      </QueryClientProvider>
    )

    // Single server info is displayed
    expect(screen.getByText('My Desktop (Local)')).toBeInTheDocument()
    expect(screen.getByText(/Local Desktop/i)).toBeInTheDocument()
  })
})
