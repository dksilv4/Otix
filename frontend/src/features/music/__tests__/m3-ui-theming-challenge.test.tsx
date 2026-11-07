import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MusicCard } from '../components/molecules/music-card'
import { MusicTrackRow } from '../components/molecules/music-track-row'
import { MusicArtistModal } from '../components/organisms/music-artist-modal'
import { MusicFoldersModal } from '../components/organisms/music-folders-modal'
import { MusicQueueDrawer } from '../components/organisms/music-queue-drawer'
import { GlobalMusicBar } from '../components/molecules/global-music-bar'
import * as playerHook from '@/lib/player/use-player'
import * as playerProgressHook from '@/lib/player/use-player-progress'

// Mock router hooks for GlobalMusicBar
const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/library' }),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

describe('Milestone 3 Challenge: UI Components, Theming & Architecture Invariants', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // -------------------------------------------------------------------------
  // 1. Empirical Codebase Architecture & Theming Invariant Oracle
  // -------------------------------------------------------------------------
  describe('1. Empirical Codebase Invariants across Music Subsystem', () => {
    const musicDir = path.resolve(__dirname, '..')
    const playerDir = path.resolve(__dirname, '../../../lib/player')

    const getFilesRecursively = (dir: string, extension: string): string[] => {
      let results: string[] = []
      const list = fs.readdirSync(dir)
      for (const file of list) {
        const fullPath = path.join(dir, file)
        const stat = fs.statSync(fullPath)
        if (stat && stat.isDirectory()) {
          results = results.concat(getFilesRecursively(fullPath, extension))
        } else if (fullPath.endsWith(extension)) {
          results.push(fullPath)
        }
      }
      return results
    }

    const musicTsx = getFilesRecursively(musicDir, '.tsx').filter((f) => !f.includes('__tests__'))
    const playerTsx = getFilesRecursively(playerDir, '.tsx').filter((f) => !f.includes('__tests__'))
    const allSourceTsx = [...musicTsx, ...playerTsx]

    it('Invariant 1: All components & router definitions must be arrow functions (0 function declarations)', () => {
      const violations: string[] = []
      for (const filePath of allSourceTsx) {
        const content = fs.readFileSync(filePath, 'utf-8')
        // Match top-level or exported function declarations: function Foo(...) or export function Foo(...)
        const matches = content.match(/^(?:export\s+)?function\s+[a-zA-Z0-9_]+\s*\(/gm)
        if (matches) {
          violations.push(`${path.basename(filePath)}: ${matches.join(', ')}`)
        }
      }
      // Also check router.ts
      const routerPath = path.join(musicDir, 'router.ts')
      if (fs.existsSync(routerPath)) {
        const content = fs.readFileSync(routerPath, 'utf-8')
        const matches = content.match(/^(?:export\s+)?function\s+[a-zA-Z0-9_]+\s*\(/gm)
        if (matches) violations.push(`router.ts: ${matches.join(', ')}`)
      }

      expect(violations).toEqual([])
    })

    it('Invariant 2: Zero hardcoded hex colors or raw palette classes in source components', () => {
      const rawHexRegex = /#[0-9a-fA-F]{3,8}\b/g
      const rawPaletteClassRegex = /\b(?:bg|text|border|fill|stroke|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/g
      const rawWhiteBlackRegex = /\b(?:bg|text)-(?:white|black)\b/g

      const violations: string[] = []
      for (const filePath of allSourceTsx) {
        const content = fs.readFileSync(filePath, 'utf-8')
        const hexMatches = content.match(rawHexRegex)
        if (hexMatches) {
          violations.push(`${path.basename(filePath)} (raw hex): ${hexMatches.join(', ')}`)
        }
        const paletteMatches = content.match(rawPaletteClassRegex)
        if (paletteMatches) {
          violations.push(`${path.basename(filePath)} (raw palette class): ${paletteMatches.join(', ')}`)
        }
        const whiteBlackMatches = content.match(rawWhiteBlackRegex)
        if (whiteBlackMatches) {
          violations.push(`${path.basename(filePath)} (raw white/black): ${whiteBlackMatches.join(', ')}`)
        }
      }

      expect(violations).toEqual([])
    })

    it('Invariant 3: Soft glassmorphism & micro-borders exclusively (border-white/[0.04] to [0.06])', () => {
      // Disallow harsh borders such as border-border, border-black, or solid opaque borders
      const harshBorderRegex = /\bborder-(?:border|black|solid)\b/g

      const violations: string[] = []
      for (const filePath of allSourceTsx) {
        const content = fs.readFileSync(filePath, 'utf-8')
        const harshMatches = content.match(harshBorderRegex)
        if (harshMatches) {
          violations.push(`${path.basename(filePath)}: ${harshMatches.join(', ')}`)
        }
      }
      expect(violations).toEqual([])
    })

    it('Invariant 4: Modals must import and instantiate the established DkDialog modal framework', () => {
      const modalFiles = ['music-album-modal.tsx', 'music-artist-modal.tsx', 'music-folders-modal.tsx']
      for (const modalFile of modalFiles) {
        const fullPath = musicTsx.find((f) => f.endsWith(modalFile))
        expect(fullPath).toBeDefined()
        const content = fs.readFileSync(fullPath!, 'utf-8')
        expect(content).toContain("import { DkDialog } from '@/components/ui/molecules/dialog'")
        expect(content).toContain('<DkDialog')
      }
    })

    it('Invariant 5: Component purity: zero helper functions or constants bags in .tsx component files', () => {
      // Ensure component files do not define top-level helper functions like formatTrackDuration, etc.
      for (const filePath of allSourceTsx) {
        const content = fs.readFileSync(filePath, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim()
          // Check for top-level helper declarations like: const format... = ...
          if (/^const\s+(format[A-Z]\w*|parse[A-Z]\w*|calculate[A-Z]\w*)\s*=/.test(line)) {
            throw new Error(`File ${path.basename(filePath)} contains helper function '${line}' at line ${i + 1}`)
          }
        }
      }
    })
  })

  // -------------------------------------------------------------------------
  // 2. Behavioral Component & Theming Stress Harness
  // -------------------------------------------------------------------------
  describe('2. Behavioral Component Verification', () => {
    it('MusicCard: renders title, subtitle, source badges and handles stopPropagation on play click', () => {
      const handlePlay = vi.fn()
      const handleClick = vi.fn()

      const { rerender } = render(
        <MusicCard
          title="Starlight"
          subtitle="Muse"
          year={2006}
          trackCount={11}
          source="local"
          onPlay={handlePlay}
          onClick={handleClick}
        />,
      )

      expect(screen.getByText('Starlight')).toBeDefined()
      expect(screen.getByText('Muse')).toBeDefined()
      expect(screen.getByText('2006')).toBeDefined()
      expect(screen.getByText('11 tracks')).toBeDefined()
      expect(screen.getByText('local')).toBeDefined()

      // Click the play button directly -> onPlay should be called, handleClick should NOT be called
      const playBtn = screen.getByLabelText('Play Starlight')
      fireEvent.click(playBtn)
      expect(handlePlay).toHaveBeenCalledOnce()
      expect(handleClick).not.toHaveBeenCalled()

      // Rerender with plex source
      rerender(
        <MusicCard
          title="Starlight"
          subtitle="Muse"
          source="plex"
          onPlay={handlePlay}
          onClick={handleClick}
        />,
      )
      expect(screen.getByText('plex')).toBeDefined()
    })

    it('MusicTrackRow: toggles equalizer animation when active and playing, otherwise shows track number', () => {
      const handlePlay = vi.fn()

      const { rerender, container } = render(
        <MusicTrackRow
          index={0}
          trackNumber={3}
          title="Hysteria"
          artist="Muse"
          albumName="Absolution"
          durationMs={235000}
          source="local"
          isActive={false}
          isPlaying={false}
          onPlay={handlePlay}
        />,
      )

      expect(screen.getByText('3')).toBeDefined()
      expect(screen.getByText('Hysteria')).toBeDefined()
      expect(screen.getByText('3:55')).toBeDefined()
      expect(container.querySelector('.animate-equalizer')).toBeNull()

      // When active and playing, trackNumber is replaced by 3-bar equalizer animation
      rerender(
        <MusicTrackRow
          index={0}
          trackNumber={3}
          title="Hysteria"
          artist="Muse"
          albumName="Absolution"
          durationMs={235000}
          source="local"
          isActive={true}
          isPlaying={true}
          onPlay={handlePlay}
        />,
      )

      const equalizerBars = container.querySelectorAll('.animate-equalizer')
      expect(equalizerBars.length).toBe(3)
    })

    it('MusicArtistModal: displays artist summary toggle and propagates album selection', () => {
      const handleSelectAlbum = vi.fn()
      const handleClose = vi.fn()

      render(
        <QueryClientProvider client={queryClient}>
          <MusicArtistModal
            open={true}
            onClose={handleClose}
            artistName="Radiohead"
            initialAlbums={[
              { ratingKey: 'alb-1', title: 'OK Computer', artist: 'Radiohead', year: 1997 },
              { ratingKey: 'alb-2', title: 'Kid A', artist: 'Radiohead', year: 2000 },
            ]}
            initialTracks={[
              { id: 'trk-1', title: 'Paranoid Android', artist: 'Radiohead', durationMs: 387000 },
            ]}
            onSelectAlbum={handleSelectAlbum}
          />
        </QueryClientProvider>,
      )

      expect(screen.getByText('Radiohead')).toBeDefined()
      expect(screen.getByText('2 albums')).toBeDefined()
      expect(screen.getByText('1 track')).toBeDefined()
      expect(screen.getByText('OK Computer')).toBeDefined()
      expect(screen.getByText('Paranoid Android')).toBeDefined()

      // Click on OK Computer album card
      const albumCard = screen.getByText('OK Computer')
      fireEvent.click(albumCard)
      expect(handleSelectAlbum).toHaveBeenCalledWith({
        ratingKey: 'alb-1',
        title: 'OK Computer',
        artist: 'Radiohead',
        thumbUrl: null,
        year: 1997,
      })
    })

    it('MusicFoldersModal: renders indexed folders and supports folder removal', () => {
      const handleClose = vi.fn()
      const handleRemove = vi.fn()
      const handleAdd = vi.fn()
      const handleClearAll = vi.fn()

      render(
        <MusicFoldersModal
          open={true}
          onClose={handleClose}
          folders={[{ id: 'f-1', name: 'FLAC_Library', trackCount: 120 }]}
          onAddFolder={handleAdd}
          onRemoveFolder={handleRemove}
          onClearAll={handleClearAll}
        />,
      )

      expect(screen.getByText('Music Folders')).toBeDefined()
      expect(screen.getByText('FLAC_Library')).toBeDefined()
      expect(screen.getByText('120 tracks')).toBeDefined()

      const removeBtn = screen.getByLabelText('Remove folder FLAC_Library')
      fireEvent.click(removeBtn)
      expect(handleRemove).toHaveBeenCalledWith('f-1', 'FLAC_Library')
    })

    it('MusicQueueDrawer: renders active queue and triggers clear / remove actions', () => {
      const handleClose = vi.fn()
      const mockStop = vi.fn()
      const mockRemove = vi.fn()

      vi.spyOn(playerHook, 'usePlayer').mockReturnValue({
        source: 'local',
        isPlaying: true,
        currentTrack: {
          id: 'q-now',
          title: 'Karma Police',
          artist: 'Radiohead',
          artists: [{ name: 'Radiohead', uri: '' }],
          albumName: 'OK Computer',
          albumArt: null,
          durationMs: 261000,
          source: 'local',
        },
        localQueue: [
          {
            id: 'q-2',
            title: 'Electioneering',
            artist: 'Radiohead',
            albumName: 'OK Computer',
            albumArt: null,
            durationMs: 230000,
            url: 'blob:test',
          },
        ],
        plexQueue: [],
        jellyfinQueue: [],
        stop: mockStop,
        removeFromQueue: mockRemove,
        repeatMode: 'off',
        isShuffled: false,
        togglePlay: vi.fn(),
        skipNext: vi.fn(),
        skipPrevious: vi.fn(),
        toggleShuffle: vi.fn(),
        setRepeatMode: vi.fn(),
        seek: vi.fn(),
        setVolume: vi.fn(),
        volume: 0.7,
        playLocalTracks: vi.fn(),
        playPlexTracks: vi.fn(),
        playPlexAlbum: vi.fn(),
        playJellyfinTracks: vi.fn(),
      } as any)

      vi.spyOn(playerProgressHook, 'usePlayerProgress').mockReturnValue({
        position: 60000,
        duration: 261000,
      })

      render(<MusicQueueDrawer isOpen={true} onClose={handleClose} />)

      expect(screen.getByText('Play Queue')).toBeDefined()
      expect(screen.getByText('Karma Police')).toBeDefined()
      expect(screen.getByText('Electioneering')).toBeDefined()
      expect(screen.getByText('Up Next (1)')).toBeDefined()

      // Click clear button
      const clearBtn = screen.getByText('Clear')
      fireEvent.click(clearBtn)
      expect(mockStop).toHaveBeenCalledOnce()

      // Click remove track button
      const removeBtn = screen.getByLabelText('Remove Electioneering from queue')
      fireEvent.click(removeBtn)
      expect(mockRemove).toHaveBeenCalledWith(0)
    })

    it('GlobalMusicBar: renders current playback and handles mute toggle', () => {
      const mockSetVolume = vi.fn()

      vi.spyOn(playerHook, 'usePlayer').mockReturnValue({
        source: 'local',
        isPlaying: true,
        currentTrack: {
          id: 'now-1',
          title: 'No Surprises',
          artist: 'Radiohead',
          artists: [{ name: 'Radiohead', uri: '' }],
          albumName: 'OK Computer',
          albumArt: null,
          durationMs: 228000,
          source: 'local',
        },
        volume: 0.8,
        setVolume: mockSetVolume,
        togglePlay: vi.fn(),
        skipNext: vi.fn(),
        skipPrevious: vi.fn(),
        seek: vi.fn(),
        stop: vi.fn(),
      } as any)

      vi.spyOn(playerProgressHook, 'usePlayerProgress').mockReturnValue({
        position: 114000,
        duration: 228000,
      })

      render(<GlobalMusicBar />)

      expect(screen.getByText('No Surprises')).toBeDefined()
      expect(screen.getByText('Radiohead')).toBeDefined()
      expect(screen.getByText('1:54')).toBeDefined()
      expect(screen.getByText('3:48')).toBeDefined()

      // Click volume icon to mute
      const volumeBtn = screen.getByLabelText('Volume')
      fireEvent.click(volumeBtn)
      expect(mockSetVolume).toHaveBeenCalledWith(0)
    })
  })
})
