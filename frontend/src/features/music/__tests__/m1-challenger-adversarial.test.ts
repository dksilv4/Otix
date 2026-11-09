import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as THREE from 'three'
import { ThreeSceneManager } from '../visualizers/utils/three-scene-manager'
import { audioVisualizerEngine } from '../visualizers/utils/audio-analyzer'
import { getOrCreateBlobUrl, clearBlobUrlCache } from '../utils/blob-url-cache'
import { UniversalPlayerEngine } from '../../player/core/universal-player-engine'
import type { PlayableMediaItem } from '../../player/types'
import type { VisualizerSceneTheme } from '../visualizers/types'

// Mock WebGLRenderer to capture lifecycle calls in jsdom
let lastRendererInstance: any = null

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>()

  class MockWebGLRenderer {
    domElement = document.createElement('canvas')
    setClearColor = vi.fn()
    setSize = vi.fn()
    setPixelRatio = vi.fn()
    getPixelRatio = vi.fn().mockReturnValue(1)
    render = vi.fn()
    dispose = vi.fn()
    forceContextLoss = vi.fn()

    constructor() {
      lastRendererInstance = this
    }
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer,
  }
})

describe('Milestone 1 Challenger Adversarial Stress Suite', () => {
  const dummyTheme: VisualizerSceneTheme = {
    primaryHex: '#8b5cf6',
    surfaceHex: '#1e1b4b',
    backgroundHex: '#0f0a1c',
    hasCustomPalette: false,
    accentRgb: { r: 139, g: 92, b: 246 },
    surfaceRgb: { r: 30, g: 27, b: 75 },
    backgroundRgb: { r: 15, g: 10, b: 28 },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.pause = vi.fn()
  })

  // =========================================================================
  // 1. WebGL / Three.js Resource Disposal & Mesh Plane Scaling
  // =========================================================================
  describe('ThreeSceneManager: Disposal, Context Loss & Mesh Plane Scaling', () => {
    it('ThreeSceneManager.dispose() safely disposes scene and renderer without forcing destructive context loss', () => {
      const canvas = document.createElement('canvas')
      const manager = new ThreeSceneManager(canvas, 800, 600)
      const renderer = lastRendererInstance

      const sceneClearSpy = vi.spyOn((manager as any).scene, 'clear')

      manager.dispose()

      expect(sceneClearSpy).toHaveBeenCalledTimes(1)
      expect(renderer.dispose).toHaveBeenCalledTimes(1)
      expect(renderer.forceContextLoss).not.toHaveBeenCalled()
    })

    it('Monolith Horizon (monolith) tracks and disposes all 84 MeshBasicMaterials + floor on mode switch / dispose', () => {
      const canvas = document.createElement('canvas')
      const manager = new ThreeSceneManager(canvas, 800, 600)

      const materialDisposeSpy = vi.spyOn(THREE.MeshBasicMaterial.prototype, 'dispose')

      // Switch to monolith (which creates Monolith Horizon scene)
      manager.switchMode('monolith', dummyTheme)

      // 42 columns * 1 colMat + 42 caps * 1 capMat + 1 floorMat = 85 materials
      expect(materialDisposeSpy).not.toHaveBeenCalled()

      // Switch mode or dispose to trigger disposal
      manager.dispose()

      // At least 84 column/cap materials plus the floor material must be disposed
      expect(materialDisposeSpy.mock.calls.length).toBeGreaterThanOrEqual(85)
    })

    it('Mesh Plane Scaling: maintains natural full-size scaling (scale = 1.0) across mesh grid presets', () => {
      const canvas = document.createElement('canvas')
      const manager = new ThreeSceneManager(canvas, 800, 600)
      const scene = (manager as any).scene as THREE.Scene

      // Preset wavy-1 (createWavy1Scene)
      manager.switchMode('wavy-1', dummyTheme)
      const meshesInWavy1 = scene.children.filter((c) => c instanceof THREE.Mesh)
      expect(meshesInWavy1.length).toBeGreaterThan(0)
      for (const mesh of meshesInWavy1) {
        expect(mesh.scale.x).toBeCloseTo(1.0, 2)
        expect(mesh.scale.y).toBeCloseTo(1.0, 2)
        expect(mesh.scale.z).toBeCloseTo(1.0, 2)
      }

      // Preset wavy-14 (createMeshGridGalaxyScene variant 14)
      manager.switchMode('wavy-14', dummyTheme)
      const meshesInWavy14 = scene.children.filter((c) => c instanceof THREE.Mesh)
      expect(meshesInWavy14.length).toBeGreaterThan(0)
      for (const mesh of meshesInWavy14) {
        expect(mesh.scale.x).toBeCloseTo(1.0, 2)
        expect(mesh.scale.y).toBeCloseTo(1.0, 2)
        expect(mesh.scale.z).toBeCloseTo(1.0, 2)
      }

      // Preset wavy-19 (createConfiguredMeshGridScene with wireframe & fill)
      manager.switchMode('wavy-19', dummyTheme)
      const meshesInWavy19 = scene.children.filter((c) => c instanceof THREE.Mesh)
      expect(meshesInWavy19.length).toBeGreaterThan(0)
      for (const mesh of meshesInWavy19) {
        expect(mesh.scale.x).toBeCloseTo(1.0, 2)
        expect(mesh.scale.y).toBeCloseTo(1.0, 2)
        expect(mesh.scale.z).toBeCloseTo(1.0, 2)
      }

      manager.dispose()
    })
  })

  // =========================================================================
  // 2. Web Audio Destination Routing & Disconnection
  // =========================================================================
  describe('AudioVisualizerEngine: Destination Routing & Complete Teardown', () => {
    let mockDestination: any
    let mockAnalyser: any
    let mockBassFilter: any
    let mockBassAnalyser: any
    let mockSourceNodes: Map<HTMLMediaElement, any>
    let mockAudioContext: any

    beforeEach(() => {
      audioVisualizerEngine.destroy()
      mockSourceNodes = new Map()
      mockDestination = { id: 'destination-node' }

      mockAnalyser = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        fftSize: 256,
        smoothingTimeConstant: 0.72,
        getByteFrequencyData: vi.fn(),
        getByteTimeDomainData: vi.fn(),
      }

      mockBassFilter = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        type: 'lowpass',
        frequency: { value: 150 },
        Q: { value: 1.0 },
      }

      mockBassAnalyser = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        fftSize: 256,
        smoothingTimeConstant: 0.62,
        getByteFrequencyData: vi.fn(),
        getByteTimeDomainData: vi.fn(),
      }

      let analyserCallCount = 0
      mockAudioContext = {
        state: 'running',
        destination: mockDestination,
        resume: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
        createAnalyser: vi.fn(() => {
          analyserCallCount++
          return analyserCallCount === 1 ? mockAnalyser : mockBassAnalyser
        }),
        createBiquadFilter: vi.fn(() => mockBassFilter),
        createMediaElementSource: vi.fn((el: HTMLMediaElement) => {
          const sourceNode = {
            id: `source-for-${el.id || 'el'}`,
            connect: vi.fn(),
            disconnect: vi.fn(),
          }
          mockSourceNodes.set(el, sourceNode)
          return sourceNode
        }),
      }

      function MockAudioContextConstructor(this: any) {
        return mockAudioContext
      }
      ;(window as any).AudioContext = MockAudioContextConstructor
      ;(window as any).webkitAudioContext = MockAudioContextConstructor
    })

    afterEach(() => {
      audioVisualizerEngine.destroy()
    })

    it('attaching audio elements connects analyser to destination ONCE, and never repeats on subsequent attachments', () => {
      const audioEl1 = document.createElement('audio')
      audioEl1.id = 'audio-1'
      const audioEl2 = document.createElement('audio')
      audioEl2.id = 'audio-2'

      ;(audioVisualizerEngine as any).attachToAudioElement(audioEl1)

      // Analyser connected to destination once
      expect(mockAnalyser.connect).toHaveBeenCalledWith(mockDestination)
      expect(mockAnalyser.connect).toHaveBeenCalledTimes(1)

      // Attach same element again
      ;(audioVisualizerEngine as any).attachToAudioElement(audioEl1)
      expect(mockAnalyser.connect).toHaveBeenCalledTimes(1)

      // Attach different element
      ;(audioVisualizerEngine as any).attachToAudioElement(audioEl2)
      // Destination connection must STILL be exactly 1
      expect(mockAnalyser.connect).toHaveBeenCalledTimes(1)
    })

    it('destroy() disconnects analyser, bassFilter, bassAnalyser, all source nodes, and closes AudioContext', () => {
      const audioEl1 = document.createElement('audio')
      audioEl1.id = 'audio-1'
      const audioEl2 = document.createElement('audio')
      audioEl2.id = 'audio-2'

      ;(audioVisualizerEngine as any).attachToAudioElement(audioEl1)
      ;(audioVisualizerEngine as any).attachToAudioElement(audioEl2)

      const source1 = mockSourceNodes.get(audioEl1)
      const source2 = mockSourceNodes.get(audioEl2)

      audioVisualizerEngine.destroy()

      expect(mockAnalyser.disconnect).toHaveBeenCalledTimes(1)
      expect(mockBassFilter.disconnect).toHaveBeenCalledTimes(1)
      expect(mockBassAnalyser.disconnect).toHaveBeenCalledTimes(1)
      expect(source1.disconnect).toHaveBeenCalledTimes(1)
      expect(source2.disconnect).toHaveBeenCalledTimes(1)
      expect(mockAudioContext.close).toHaveBeenCalledTimes(1)
    })
  })

  // =========================================================================
  // 3. Blob URL Cache: True LRU, Eviction & Revocation Safety
  // =========================================================================
  describe('blobUrlCache: True LRU, Eviction & Dead URL Prevention', () => {
    let originalCreateObjectURL: any
    let originalRevokeObjectURL: any
    let revokedUrls: Set<string>
    let urlCounter: number

    beforeEach(() => {
      clearBlobUrlCache()
      revokedUrls = new Set()
      urlCounter = 0

      originalCreateObjectURL = URL.createObjectURL
      originalRevokeObjectURL = URL.revokeObjectURL

      URL.createObjectURL = vi.fn((blob: Blob) => {
        urlCounter++
        return `blob:http://localhost/test-blob-${urlCounter}`
      })

      URL.revokeObjectURL = vi.fn((url: string) => {
        revokedUrls.add(url)
      })
    })

    afterEach(() => {
      clearBlobUrlCache()
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
    })

    it('returns null safely for null or undefined input', () => {
      expect(getOrCreateBlobUrl(null)).toBeNull()
      expect(getOrCreateBlobUrl(undefined)).toBeNull()
    })

    it('refreshes LRU recency on cache hit so recently accessed entries survive eviction', () => {
      const blobs: Blob[] = []
      // Fill cache to capacity (300)
      for (let i = 0; i < 300; i++) {
        const b = new Blob([`content-${i}`], { type: 'audio/mp3' })
        blobs.push(b)
        getOrCreateBlobUrl(b)
      }

      const blob0Url = getOrCreateBlobUrl(blobs[0]) // Recency refreshed!
      expect(revokedUrls.has(blob0Url!)).toBe(false)

      // Add a 301st blob to trigger eviction
      const extraBlob = new Blob(['extra'], { type: 'audio/mp3' })
      getOrCreateBlobUrl(extraBlob)

      // Oldest entry should have been blobs[1] because blobs[0] was refreshed
      const blob1InitialUrl = `blob:http://localhost/test-blob-2` // second created
      expect(revokedUrls.has(blob1InitialUrl)).toBe(true)

      // blobs[0] should still be valid and unrevoked
      expect(revokedUrls.has(blob0Url!)).toBe(false)
    })

    it('evicted blobs do NOT return revoked dead URLs when accessed again; they generate fresh URLs', () => {
      const blobs: Blob[] = []
      for (let i = 0; i < 300; i++) {
        const b = new Blob([`blob-${i}`], { type: 'audio/mp3' })
        blobs.push(b)
        getOrCreateBlobUrl(b)
      }

      const evictedBlob = blobs[0]
      const originalEvictedUrl = `blob:http://localhost/test-blob-1`

      // Add 301st blob to force eviction of blob[0]
      const nextBlob = new Blob(['next'], { type: 'audio/mp3' })
      getOrCreateBlobUrl(nextBlob)

      // Verify original URL was revoked
      expect(revokedUrls.has(originalEvictedUrl)).toBe(true)

      // Accessing evictedBlob again must NOT return the dead revoked URL
      const freshUrl = getOrCreateBlobUrl(evictedBlob)
      expect(freshUrl).not.toBeNull()
      expect(freshUrl).not.toBe(originalEvictedUrl)
      expect(revokedUrls.has(freshUrl!)).toBe(false)
    })

    it('clearBlobUrlCache() revokes all active URLs and empties cache', () => {
      const b1 = new Blob(['1'], { type: 'audio/mp3' })
      const b2 = new Blob(['2'], { type: 'audio/mp3' })
      const u1 = getOrCreateBlobUrl(b1)!
      const u2 = getOrCreateBlobUrl(b2)!

      expect(revokedUrls.size).toBe(0)

      clearBlobUrlCache()

      expect(revokedUrls.has(u1)).toBe(true)
      expect(revokedUrls.has(u2)).toBe(true)

      // Re-accessing b1 produces fresh URL
      const u1New = getOrCreateBlobUrl(b1)
      expect(u1New).not.toBe(u1)
    })
  })

  // =========================================================================
  // 4. Universal Player Queue State: Shuffle & Repeat-All Single Track
  // =========================================================================
  describe('UniversalPlayerEngine: Shuffle State Sync & Repeat-All Invariants', () => {
    const makeTrack = (id: string, title: string): PlayableMediaItem => ({
      id,
      title,
      artist: 'Test Artist',
      mediaType: 'audio',
      source: 'direct',
      streamUrl: `http://localhost/audio/${id}.mp3`,
      duration: 180,
    })

    let engine: UniversalPlayerEngine

    beforeEach(() => {
      engine = new UniversalPlayerEngine()
    })

    afterEach(() => {
      engine.stop()
    })

    it('single-track queue with repeatMode = "all" loops back to beginning instead of halting playback', async () => {
      const track1 = makeTrack('t1', 'Track 1')

      await engine.play(track1)
      engine.setRepeatMode('all')

      expect(engine.getState().currentItem?.id).toBe('t1')
      expect(engine.getState().queue.length).toBe(0)

      // Simulate skipping next (or item ended)
      await engine.skipNext()

      // Invariant: track1 should be replaying, status should NOT be idle or stopped
      expect(engine.getState().currentItem?.id).toBe('t1')
      expect(engine.getState().status).not.toBe('idle')
    })

    it('multi-track queue with repeatMode = "all" loops from last track back to first track', async () => {
      const t1 = makeTrack('t1', 'Track 1')
      const t2 = makeTrack('t2', 'Track 2')

      await engine.play([t1, t2])
      engine.setRepeatMode('all')

      expect(engine.getState().currentItem?.id).toBe('t1')
      expect(engine.getState().queue.length).toBe(1)

      // Advance to t2
      await engine.skipNext()
      expect(engine.getState().currentItem?.id).toBe('t2')
      expect(engine.getState().queue.length).toBe(0)

      // Advance at end of playlist under repeat-all
      await engine.skipNext()
      // Should loop back to t1, with t2 in upcoming queue
      expect(engine.getState().currentItem?.id).toBe('t1')
      expect(engine.getState().queue.length).toBe(1)
      expect(engine.getState().queue[0].id).toBe('t2')
    })

    it('maintains unShuffledQueue synchronization across addToQueue, removeFromQueue, and playback while shuffled', async () => {
      const t1 = makeTrack('t1', 'Track 1')
      const t2 = makeTrack('t2', 'Track 2')
      const t3 = makeTrack('t3', 'Track 3')
      const t4 = makeTrack('t4', 'Track 4')

      await engine.play(t1, { customQueue: [t2, t3, t4] })

      // Turn on shuffle
      engine.toggleShuffle()
      expect(engine.getState().isShuffled).toBe(true)

      // Add track 5 to queue while shuffled
      const t5 = makeTrack('t5', 'Track 5')
      engine.addToQueue(t5)

      // Verify t5 is in active queue and unShuffledQueue
      expect(engine.getState().queue.some((t) => t.id === 't5')).toBe(true)
      expect((engine as any).unShuffledQueue.some((t: any) => t.id === 't5')).toBe(true)

      // Remove a track from queue while shuffled
      const removedTarget = engine.getState().queue[0]
      engine.removeFromQueue(0)

      // Removed track should neither be in queue nor in unShuffledQueue
      expect(engine.getState().queue.some((t) => t.id === removedTarget.id)).toBe(false)
      expect((engine as any).unShuffledQueue.some((t: any) => t.id === removedTarget.id)).toBe(false)

      // Advance to next track while shuffled
      const nextTrack = engine.getState().queue[0]
      await engine.skipNext()
      expect(engine.getState().currentItem?.id).toBe(nextTrack.id)

      // Played track should be removed from unShuffledQueue
      expect((engine as any).unShuffledQueue.some((t: any) => t.id === nextTrack.id)).toBe(false)

      // Turn OFF shuffle
      engine.toggleShuffle()
      expect(engine.getState().isShuffled).toBe(false)

      // Invariant: unShuffledQueue must accurately reflect remaining unplayed tracks
      const remainingIds = engine.getState().queue.map((t) => t.id)
      expect(remainingIds).not.toContain(t1.id)
      expect(remainingIds).not.toContain(nextTrack.id)
      expect(remainingIds).not.toContain(removedTarget.id)
      if (removedTarget.id !== 't5') {
        expect(remainingIds).toContain('t5')
      }
    })
  })
})
