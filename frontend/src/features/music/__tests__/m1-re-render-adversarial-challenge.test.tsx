import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, act, screen } from '@testing-library/react'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { useAudioVisualizer } from '../visualizers/hooks/use-audio-visualizer'
import { audioVisualizerEngine } from '../visualizers/utils/audio-analyzer'
import { getOrCreateBlobUrl, clearBlobUrlCache } from '../utils/blob-url-cache'
import { UniversalPlayerEngine } from '@/features/player/core/universal-player-engine'
import type { PlayableMediaItem } from '@/features/player/core/types'
import { GlobalMusicBar } from '../components/molecules/global-music-bar'
import * as playerHook from '@/lib/player/use-player'
import * as playerProgressHook from '@/lib/player/use-player-progress'

// Mock router hooks for GlobalMusicBar
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/library' }),
}))

describe('Milestone 1 Adversarial Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearBlobUrlCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // -------------------------------------------------------------------------
  // 1. Empirical Re-render Throttling Verification of useAudioVisualizer
  // -------------------------------------------------------------------------
  describe('1. React Re-render Optimization in useAudioVisualizer', () => {
    it('throttles RAF state updates: 60fps/120fps loop causes <= 2 re-renders per second, NOT 60-120', () => {
      let renderCount = 0
      let rafCallback: FrameRequestCallback | null = null
      let currentRafId = 0

      // Mock requestAnimationFrame to capture ticks
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
        rafCallback = cb
        return ++currentRafId
      })
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
        rafCallback = null
      })

      // Mock audioVisualizerEngine.getAudioFrame to return varying BPM
      let mockBpm = 120
      vi.spyOn(audioVisualizerEngine, 'getAudioFrame').mockImplementation(() => ({
        frequencyData: new Uint8Array(128),
        waveformData: new Uint8Array(128),
        bass: 0.5,
        energy: 0.5,
        kick: false,
        snare: false,
        vocal: 0.5,
        bpm: mockBpm,
        isPlaying: true,
      }))

      const { result } = renderHook(() => {
        renderCount++
        return useAudioVisualizer(0, 180000, true, true)
      })

      // Initial mount has 2 renders in React (initial render + isPlaying mount effect)
      expect(renderCount).toBe(2)
      expect(rafCallback).not.toBeNull()

      const rendersBeforeFrames = renderCount

      // Simulate 60 frames spanning 1000ms (16.6ms per frame)
      // Worker's throttle logic: timeSinceLast >= 1000 || (Math.abs(currentBpm - lastBpm) > 1 && timeSinceLast >= 500)
      act(() => {
        let timestamp = 16.6
        for (let frame = 1; frame <= 60; frame++) {
          mockBpm = 120 + (frame % 5) // fluctuates slightly
          if (rafCallback) {
            const cb = rafCallback
            cb(timestamp)
          }
          timestamp += 16.6
        }
      })

      const framesRenders = renderCount - rendersBeforeFrames
      // Across 60 frames, state updates must be strictly throttled to at most 2 (t=500ms and t=1000ms)
      expect(framesRenders).toBeLessThanOrEqual(2)
      expect(framesRenders).toBeGreaterThanOrEqual(1)
      // Must NOT be anywhere near 60!
      expect(framesRenders).not.toBe(60)
    })

    it('when active is false, does not schedule requestAnimationFrame', () => {
      let rafCallCount = 0
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => {
        rafCallCount++
        return 1
      })

      let renderCount = 0
      renderHook(() => {
        renderCount++
        return useAudioVisualizer(0, 180000, true, false) // active = false
      })

      // Active is false -> 0 RAF loops scheduled
      expect(rafCallCount).toBe(0)
    })

    it('rapid positionMs and durationMs updates do NOT trigger setFrame re-renders', () => {
      let rafCallback: FrameRequestCallback | null = null
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        rafCallback = cb
        return 1
      })

      let renderCount = 0
      const { rerender } = renderHook(
        ({ pos, dur }) => {
          renderCount++
          return useAudioVisualizer(pos, dur, true, true)
        },
        { initialProps: { pos: 1000, dur: 180000 } },
      )

      const initialMountRenders = renderCount
      expect(initialMountRenders).toBe(2)

      // Rerender with changing position 10 times without advancing RAF timer past throttle threshold
      for (let i = 1; i <= 10; i++) {
        rerender({ pos: 1000 + i * 100, dur: 180000 })
      }

      // renderCount equals the initial renders + 10 external prop passes, with 0 internal setFrame updates
      expect(renderCount).toBe(initialMountRenders + 10)
    })
  })

  // -------------------------------------------------------------------------
  // 2. GlobalMusicBar FullScreenMusicPlayer Conditional Mounting
  // -------------------------------------------------------------------------
  describe('2. GlobalMusicBar Lazy Mounting', () => {
    it('FullScreenMusicPlayer is NOT mounted in the DOM when isFullScreenOpen is false', () => {
      vi.spyOn(playerHook, 'usePlayer').mockReturnValue({
        source: 'local',
        isPlaying: true,
        currentTrack: {
          id: 'test-trk-1',
          title: 'Paranoid Android',
          artist: 'Radiohead',
          artists: [{ name: 'Radiohead', uri: '' }],
          albumName: 'OK Computer',
          albumArt: null,
          durationMs: 387000,
          source: 'local',
        },
        volume: 0.8,
        setVolume: vi.fn(),
        togglePlay: vi.fn(),
        skipNext: vi.fn(),
        skipPrevious: vi.fn(),
        seek: vi.fn(),
        stop: vi.fn(),
      } as any)

      vi.spyOn(playerProgressHook, 'usePlayerProgress').mockReturnValue({
        position: 60000,
        duration: 387000,
      })

      const { container } = render(<GlobalMusicBar />)

      // Verify the bar itself renders
      expect(screen.getByText('Paranoid Android')).toBeDefined()

      // FullScreenMusicPlayer overlay key is 'full-screen-player-overlay' or contains 'Exit Full Screen'
      expect(screen.queryByLabelText('Close Full Screen Player (Esc)')).toBeNull()
      expect(screen.queryByLabelText('Exit Full Screen')).toBeNull()
      expect(container.querySelector('.fixed.inset-0.z-\\[10000\\]')).toBeNull()
    })
  })

  // -------------------------------------------------------------------------
  // 3. Strict Theming Token Compliance in full-screen-music-player.tsx
  // -------------------------------------------------------------------------
  describe('3. Strict Theming Verification of full-screen-music-player.tsx', () => {
    const playerFilePath = path.resolve(
      __dirname,
      '../visualizers/components/full-screen-music-player.tsx',
    )

    it('has zero raw hex colors, zero raw palette classes, zero raw white/black', () => {
      expect(fs.existsSync(playerFilePath)).toBe(true)
      const content = fs.readFileSync(playerFilePath, 'utf-8')

      // Check raw hex
      const rawHexRegex = /#[0-9a-fA-F]{3,8}\b/g
      const hexMatches = content.match(rawHexRegex) || []
      expect(hexMatches).toEqual([])

      // Check raw palette classes (e.g. bg-emerald-500, text-blue-400)
      const rawPaletteClassRegex = /\b(?:bg|text|border|fill|stroke|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d+\b/g
      const paletteMatches = content.match(rawPaletteClassRegex) || []
      expect(paletteMatches).toEqual([])

      // Check raw bg-black, bg-white, text-black, text-white
      const rawWhiteBlackRegex = /\b(?:bg|text)-(?:white|black)\b/g
      const whiteBlackMatches = content.match(rawWhiteBlackRegex) || []
      expect(whiteBlackMatches).toEqual([])

      // Check harsh borders
      const harshBorderRegex = /\bborder-(?:border|black|solid)\b/g
      const harshMatches = content.match(harshBorderRegex) || []
      expect(harshMatches).toEqual([])

      // Verify token compliance
      expect(content).toContain('bg-primary text-primary-foreground')
    })
  })

  // -------------------------------------------------------------------------
  // 4. Blob URL Cache LRU Eviction & Lifecycle Safety
  // -------------------------------------------------------------------------
  describe('4. Blob URL Cache True LRU and Eviction Safety', () => {
    it('refreshes LRU recency on access and evicts oldest entries without returning dead URLs', () => {
      const createdUrls: string[] = []
      const revokedUrls: string[] = []

      let urlCounter = 0
      vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
        const url = `blob:mock-uuid-${++urlCounter}`
        createdUrls.push(url)
        return url
      })
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url: string) => {
        revokedUrls.push(url)
      })

      // Create 300 blobs (filling the cache limit)
      const blobs: Blob[] = []
      for (let i = 0; i < 300; i++) {
        const b = new Blob([`blob-content-${i}`], { type: 'audio/flac' })
        blobs.push(b)
        getOrCreateBlobUrl(b)
      }

      expect(createdUrls.length).toBe(300)
      expect(revokedUrls.length).toBe(0)

      // Access blob 0 again -> must refresh recency to end of LRU
      const refreshedUrl = getOrCreateBlobUrl(blobs[0])
      expect(refreshedUrl).toBe(createdUrls[0])

      // Now add 301st blob -> oldest entry should be blob 1 (NOT blob 0, because blob 0 was refreshed!)
      const blob301 = new Blob(['blob-301'], { type: 'audio/flac' })
      getOrCreateBlobUrl(blob301)

      expect(revokedUrls.length).toBe(1)
      expect(revokedUrls[0]).toBe(createdUrls[1]) // blob 1 was evicted and revoked!

      // Re-requesting evicted blob 1 must create a NEW valid URL, NOT return the revoked dead URL
      const recreatedUrl = getOrCreateBlobUrl(blobs[1])
      expect(recreatedUrl).not.toBe(createdUrls[1])
      expect(recreatedUrl).toBe(createdUrls[createdUrls.length - 1])

      // Clear cache must revoke all remaining active URLs
      clearBlobUrlCache()
      expect(revokedUrls.length).toBe(302)
    })
  })

  // -------------------------------------------------------------------------
  // 5. UniversalPlayerEngine Repeat-All and Shuffle State Sync
  // -------------------------------------------------------------------------
  describe('5. UniversalPlayerEngine State Integrity', () => {
    it('single-track playlist loops when repeatMode is all instead of stopping', async () => {
      const engine = new UniversalPlayerEngine()
      const singleItem: PlayableMediaItem = {
        id: 'single-1',
        title: 'One Track',
        artist: 'Solo Artist',
        url: 'http://example.com/audio.mp3',
        source: 'local',
        type: 'audio',
      }

      await engine.play(singleItem)
      engine.setRepeatMode('all')

      expect(engine.getState().queue.length).toBe(0)
      expect(engine.getState().currentItem?.id).toBe('single-1')

      // Advance to next track (simulating track end)
      await engine.skipNext()

      // Must replay singleItem instead of stopping playback
      expect(engine.getState().currentItem?.id).toBe('single-1')
      expect(engine.getState().status).not.toBe('idle')
    })

    it('unShuffledQueue stays in sync when items are added or removed during shuffle', () => {
      const engine = new UniversalPlayerEngine()
      const item1: PlayableMediaItem = { id: 'item-1', title: 'T1', source: 'local', type: 'audio' }
      const item2: PlayableMediaItem = { id: 'item-2', title: 'T2', source: 'local', type: 'audio' }
      const item3: PlayableMediaItem = { id: 'item-3', title: 'T3', source: 'local', type: 'audio' }

      engine.addToQueue([item1, item2])
      expect(engine.getState().queue.length).toBe(2)

      // Turn on shuffle
      engine.toggleShuffle()
      expect(engine.getState().isShuffled).toBe(true)

      // Add item3 while shuffled
      engine.addToQueue(item3)
      expect(engine.getState().queue.length).toBe(3)

      // Remove item2 while shuffled
      const idxOfItem2 = engine.getState().queue.findIndex((i) => i.id === 'item-2')
      expect(idxOfItem2).toBeGreaterThanOrEqual(0)
      engine.removeFromQueue(idxOfItem2)
      expect(engine.getState().queue.length).toBe(2)

      // Toggle shuffle off -> queue should reflect original order with additions/removals preserved
      engine.toggleShuffle()
      expect(engine.getState().isShuffled).toBe(false)
      const finalQueueIds = engine.getState().queue.map((i) => i.id)
      expect(finalQueueIds).toEqual(['item-1', 'item-3'])
    })
  })
})
