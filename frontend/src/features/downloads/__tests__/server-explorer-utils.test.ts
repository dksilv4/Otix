import { describe, it, expect } from 'vitest';
import {
  parseBreadcrumbs,
  isPathEqual,
  getFormatBadgeColor,
  sortExplorerEntries,
  formatExplorerDate,
  normalizeExplorerBrowse,
} from '../server-explorer-utils';
import type { ServerExplorerEntry } from '../server-explorer-types';

describe('Server File Explorer Utilities', () => {
  describe('parseBreadcrumbs', () => {
    it('parses POSIX absolute paths into interactive breadcrumbs', () => {
      const crumbs = parseBreadcrumbs('/storage/downloads/games');
      expect(crumbs).toEqual([
        { label: 'Root (/)', fullPath: '/' },
        { label: 'storage', fullPath: '/storage' },
        { label: 'downloads', fullPath: '/storage/downloads' },
        { label: 'games', fullPath: '/storage/downloads/games' },
      ]);
    });

    it('parses Windows drive paths correctly', () => {
      const crumbs = parseBreadcrumbs('C:\\Games\\OtixDownloads');
      expect(crumbs).toEqual([
        { label: 'C:', fullPath: 'C:\\' },
        { label: 'Games', fullPath: 'C:\\Games' },
        { label: 'OtixDownloads', fullPath: 'C:\\Games\\OtixDownloads' },
      ]);
    });

    it('handles relative path breadcrumbs', () => {
      const crumbs = parseBreadcrumbs('storage/installers');
      expect(crumbs).toEqual([
        { label: 'storage', fullPath: 'storage' },
        { label: 'installers', fullPath: 'storage/installers' },
      ]);
    });

    it('handles empty path', () => {
      expect(parseBreadcrumbs('')).toEqual([]);
    });
  });

  describe('isPathEqual', () => {
    it('normalizes slashes, trailing slashes, and casing', () => {
      expect(isPathEqual('/storage/downloads/', '/storage/downloads')).toBe(true);
      expect(isPathEqual('storage\\downloads', 'storage/downloads')).toBe(true);
      expect(isPathEqual('C:\\Games\\', 'c:/games')).toBe(true);
      expect(isPathEqual('/storage/downloads', '/storage/installers')).toBe(false);
      expect(isPathEqual(null, '/storage')).toBe(false);
      expect(isPathEqual('/storage', undefined)).toBe(false);
    });
  });

  describe('getFormatBadgeColor', () => {
    it('returns appropriate badges for all format categories', () => {
      expect(getFormatBadgeColor('iso').label).toBe('ISO');
      expect(getFormatBadgeColor('installer').label).toBe('INSTALLER');
      expect(getFormatBadgeColor('game').label).toBe('GAME');
      expect(getFormatBadgeColor('archive').label).toBe('ARCHIVE');
      expect(getFormatBadgeColor('rom').label).toBe('ROM');
      expect(getFormatBadgeColor('folder').label).toBe('FOLDER');
      expect(getFormatBadgeColor('file').label).toBe('FILE');
    });
  });

  describe('sortExplorerEntries', () => {
    const mockEntries: ServerExplorerEntry[] = [
      {
        name: 'The_Witcher_3.exe',
        path: '/storage/The_Witcher_3.exe',
        is_dir: false,
        size: 19000,
        extension: '.exe',
        format_category: 'installer',
        is_downloadable: true,
        is_download_location: false,
      },
      {
        name: 'repacks',
        path: '/storage/repacks',
        is_dir: true,
        size: 0,
        extension: '',
        format_category: 'folder',
        is_downloadable: false,
        is_download_location: false,
      },
      {
        name: 'Cyberpunk.iso',
        path: '/storage/Cyberpunk.iso',
        is_dir: false,
        size: 20000,
        extension: '.iso',
        format_category: 'iso',
        is_downloadable: true,
        is_download_location: false,
      },
      {
        name: 'archives',
        path: '/storage/archives',
        is_dir: true,
        size: 0,
        extension: '',
        format_category: 'folder',
        is_downloadable: false,
        is_download_location: false,
      },
    ];

    it('sorts folders first alphabetically, then files alphabetically', () => {
      const sorted = sortExplorerEntries(mockEntries);
      expect(sorted.map((e) => e.name)).toEqual([
        'archives',
        'repacks',
        'Cyberpunk.iso',
        'The_Witcher_3.exe',
      ]);
    });

    it('filters entries when search query is provided', () => {
      const filtered = sortExplorerEntries(mockEntries, 'cyber');
      expect(filtered.map((e) => e.name)).toEqual(['Cyberpunk.iso']);
    });
  });

  describe('normalizeExplorerBrowse', () => {
    it('maps camelCase API payloads onto the explorer types', () => {
      const browse = normalizeExplorerBrowse({
        currentPath: '/app',
        parentPath: '/',
        isRoot: false,
        activeDownloadPath: '/app/storage/downloads',
        totalItems: 1,
        diskFreeBytes: 10,
        diskTotalBytes: 20,
        entries: [
          {
            name: 'storage',
            path: '/app/storage',
            isDir: true,
            size: 0,
            extension: '',
            formatCategory: 'folder',
            modifiedAt: '2026-09-18T00:00:00Z',
            isDownloadable: false,
            isDownloadLocation: true,
          },
        ],
      })

      expect(browse.current_path).toBe('/app')
      expect(browse.parent_path).toBe('/')
      expect(browse.is_root).toBe(false)
      expect(browse.active_download_path).toBe('/app/storage/downloads')
      expect(browse.total_items).toBe(1)
      expect(browse.disk_free_bytes).toBe(10)
      expect(browse.disk_total_bytes).toBe(20)
      expect(browse.entries).toEqual([
        {
          name: 'storage',
          path: '/app/storage',
          is_dir: true,
          size: 0,
          extension: '',
          format_category: 'folder',
          modified_at: '2026-09-18T00:00:00Z',
          is_downloadable: false,
          is_download_location: true,
        },
      ])
    })

    it('keeps snake_case payloads working', () => {
      const browse = normalizeExplorerBrowse({
        current_path: '/',
        parent_path: null,
        is_root: true,
        active_download_path: '/downloads',
        total_items: 0,
        entries: [],
      })

      expect(browse.current_path).toBe('/')
      expect(browse.is_root).toBe(true)
      expect(browse.entries).toEqual([])
    })
  })

  describe('formatExplorerDate', () => {
    it('formats ISO timestamps to human-readable dates', () => {
      const result = formatExplorerDate('2026-09-15T00:23:54.705591+00:00');
      expect(result).toContain('2026');
      expect(result).toContain('Sep');
    });

    it('handles null and undefined gracefully', () => {
      expect(formatExplorerDate(null)).toBe('');
      expect(formatExplorerDate(undefined)).toBe('');
    });
  });
});
