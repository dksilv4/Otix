import { describe, it, expect } from 'vitest'
import {
  normalizePath,
  getBaseFolderName,
  normalizeScanPathItems,
  buildConfiguredFolderList,
  filterFolderItems,
  loadStoredPathsViewMode,
  saveStoredPathsViewMode,
  getSuggestedDefaultPaths,
} from '../paths'

describe('paths utils', () => {
  it('normalizes paths properly', () => {
    expect(normalizePath('C:\\Games\\Steam\\')).toBe('c:\\games\\steam')
    expect(normalizePath('/media/games///')).toBe('/media/games')
    expect(normalizePath('')).toBe('')
    expect(normalizePath(null)).toBe('')
    expect(normalizePath(undefined)).toBe('')
    expect(normalizePath(123 as any)).toBe('')
  })

  it('extracts base folder name', () => {
    expect(getBaseFolderName('C:\\Games\\Steam')).toBe('Steam')
    expect(getBaseFolderName('/media/games/isos/')).toBe('isos')
    expect(getBaseFolderName('D:/Downloads')).toBe('Downloads')
    expect(getBaseFolderName('')).toBe('')
    expect(getBaseFolderName(null)).toBe('')
    expect(getBaseFolderName(undefined)).toBe('')
  })

  it('normalizes scan path items from various shapes including legacy strings', () => {
    const raw = [
      'C:\\Games\\Steam',
      { path: 'D:\\Games\\Epic', type: 'game' },
      { path: 'E:\\ISOs', type: 'iso' },
      { path: '  ', type: 'game' },
      null,
      undefined,
      { notAPath: true },
      'E:\\ISOs', // Duplicate path, should preserve existing ISO type
    ]

    const normalized = normalizeScanPathItems(raw)
    expect(normalized).toEqual([
      { path: 'C:\\Games\\Steam', type: 'installed' },
      { path: 'D:\\Games\\Epic', type: 'installed' },
      { path: 'E:\\ISOs', type: 'provider' },
    ])

    expect(normalizeScanPathItems(null)).toEqual([])
    expect(normalizeScanPathItems(undefined)).toEqual([])
    expect(normalizeScanPathItems('not an array')).toEqual([])
  })

  it('aggregates and deduplicates scan paths and destinations into configured folders', () => {
    const scanPaths = [
      { path: 'C:\\Games\\Steam', type: 'game' as const },
      { path: 'C:\\Games\\ISOs', type: 'iso' as const },
    ]
    const gamesInstall = 'C:\\Games\\Steam'
    const gamesDownload = 'D:\\Downloads\\Games'
    const isoDownload = 'C:\\Games\\ISOs'

    const list = buildConfiguredFolderList(scanPaths, gamesInstall, gamesDownload, isoDownload)

    expect(list).toHaveLength(3)

    const steam = list.find((item) => item.path === 'C:\\Games\\Steam')
    expect(steam).toBeDefined()
    expect(steam?.isInstallation).toBe(true)
    expect(steam?.isGamesDownload).toBe(false)
    expect(steam?.isIso).toBe(false)

    const isos = list.find((item) => item.path === 'C:\\Games\\ISOs')
    expect(isos).toBeDefined()
    expect(isos?.isIso).toBe(true)

    const downloads = list.find((item) => item.path === 'D:\\Downloads\\Games')
    expect(downloads).toBeDefined()
    expect(downloads?.isGamesDownload).toBe(true)
    expect(downloads?.isInstallation).toBe(false)
  })

  it('defensively handles raw string arrays and undefined inputs in buildConfiguredFolderList', () => {
    // Legacy array of strings
    const rawLegacyScanPaths: any = ['C:\\Games\\Steam', 'D:\\Games\\GOG']
    const list = buildConfiguredFolderList(rawLegacyScanPaths, undefined, null, '')

    expect(list).toHaveLength(2)
    expect(list[0].path).toBe('C:\\Games\\Steam')
    expect(list[1].path).toBe('D:\\Games\\GOG')

    // Completely empty or null inputs
    expect(buildConfiguredFolderList(null, null, null, null)).toEqual([])
    expect(buildConfiguredFolderList(undefined, undefined, undefined, undefined)).toEqual([])

    // Array with null, undefined, or empty objects
    const malformedScanPaths: any = [null, undefined, {}, { path: '   ' }, { path: 'E:\\Valid' }]
    const safeList = buildConfiguredFolderList(malformedScanPaths)
    expect(safeList).toHaveLength(1)
    expect(safeList[0].path).toBe('E:\\Valid')
  })

  it('filters folder items by search and filter tab', () => {
    const items = [
      { path: 'C:\\Games\\Steam', name: 'Steam', isInstallation: true, isGamesDownload: false, isIso: false },
      { path: 'D:\\Downloads\\Games', name: 'Games', isInstallation: false, isGamesDownload: true, isIso: false },
      { path: 'E:\\ISOs\\PS2', name: 'PS2', isInstallation: false, isGamesDownload: false, isIso: true },
    ]

    expect(filterFolderItems(items, '', 'all')).toHaveLength(3)
    expect(filterFolderItems(items, '', 'installation')).toHaveLength(1)
    expect(filterFolderItems(items, '', 'installation')[0].name).toBe('Steam')
    expect(filterFolderItems(items, '', 'download')).toHaveLength(1)
    expect(filterFolderItems(items, '', 'download')[0].name).toBe('Games')
    expect(filterFolderItems(items, '', 'iso')).toHaveLength(1)
    expect(filterFolderItems(items, '', 'iso')[0].name).toBe('PS2')

    expect(filterFolderItems(items, 'ps2', 'all')).toHaveLength(1)
    expect(filterFolderItems(items, 'xyz', 'all')).toHaveLength(0)
    expect(filterFolderItems(null as any, '', 'all')).toEqual([])
  })

  it('persists and loads view mode in localStorage', () => {
    localStorage.clear()
    expect(loadStoredPathsViewMode()).toBe('cards')
    saveStoredPathsViewMode('list')
    expect(loadStoredPathsViewMode()).toBe('list')
  })

  it('suggests default paths safely even when existing paths are strings or malformed', () => {
    const suggestions = getSuggestedDefaultPaths(['C:\\Games', { path: 'D:\\Games' } as any], true)
    expect(suggestions.some((s) => s.path === 'C:\\Games')).toBe(false)
    expect(suggestions.some((s) => s.path === 'D:\\Games')).toBe(false)
    expect(suggestions.some((s) => s.source === 'steam')).toBe(true)

    // Null/undefined safety
    expect(() => getSuggestedDefaultPaths(null as any, true)).not.toThrow()
    expect(() => getSuggestedDefaultPaths(undefined, true)).not.toThrow()
  })
})
