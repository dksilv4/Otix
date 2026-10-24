import { describe, it, expect } from 'vitest'
import {
  normalizePath,
  getBaseFolderName,
  buildConfiguredFolderList,
  filterFolderItems,
  loadStoredPathsViewMode,
  saveStoredPathsViewMode,
} from '../paths'

describe('paths utils', () => {
  it('normalizes paths properly', () => {
    expect(normalizePath('C:\\Games\\Steam\\')).toBe('c:\\games\\steam')
    expect(normalizePath('/media/games///')).toBe('/media/games')
    expect(normalizePath('')).toBe('')
  })

  it('extracts base folder name', () => {
    expect(getBaseFolderName('C:\\Games\\Steam')).toBe('Steam')
    expect(getBaseFolderName('/media/games/isos/')).toBe('isos')
    expect(getBaseFolderName('D:/Downloads')).toBe('Downloads')
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
  })

  it('persists and loads view mode in localStorage', () => {
    localStorage.clear()
    expect(loadStoredPathsViewMode()).toBe('cards')
    saveStoredPathsViewMode('list')
    expect(loadStoredPathsViewMode()).toBe('list')
  })
})
