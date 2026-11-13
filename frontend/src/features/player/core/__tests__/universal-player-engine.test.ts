import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UniversalPlayerEngine } from '../universal-player-engine'
import { adapterRegistry } from '../../adapters/registry'
import type { MediaSourceAdapter, PlayableMediaItem } from '../../types'

describe('UniversalPlayerEngine', () => {
  let engine: UniversalPlayerEngine
  let mockAdapter: MediaSourceAdapter

  beforeEach(() => {
    vi.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
    vi.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})

    adapterRegistry.clear()
    mockAdapter = {
      id: 'mock',
      name: 'Mock Source',
      supports: (item) => item.source === 'mock',
      resolvePlayback: vi.fn().mockResolvedValue({
        engine: 'html5-audio',
        streamUrl: 'https://example.com/audio.mp3',
        playbackMethod: 'direct-play',
      }),
      reportProgress: vi.fn().mockResolvedValue(undefined),
    }
    adapterRegistry.register(mockAdapter)
    engine = new UniversalPlayerEngine()
  })

  it('initializes with default idle state', () => {
    const state = engine.getState()
    expect(state.status).toBe('idle')
    expect(state.currentItem).toBeNull()
    expect(state.queue).toEqual([])
    expect(state.history).toEqual([])
  })

  it('plays an item and sets viewMode based on mediaType', async () => {
    const audioItem: PlayableMediaItem = {
      id: 'mock-1',
      source: 'mock',
      mediaType: 'audio',
      title: 'Mock Audio',
    }

    await engine.play(audioItem)
    expect(engine.getState().currentItem).toEqual(audioItem)
    expect(engine.getState().status).toBe('playing')
    expect(engine.getState().viewMode).toBe('minibar')

    const videoItem: PlayableMediaItem = {
      id: 'mock-2',
      source: 'mock',
      mediaType: 'video',
      title: 'Mock Video',
    }

    await engine.play(videoItem)
    expect(engine.getState().currentItem).toEqual(videoItem)
    expect(engine.getState().status).toBe('playing')
    expect(engine.getState().viewMode).toBe('cinema')
  })

  it('manages queue and advances on skipNext', async () => {
    const item1: PlayableMediaItem = { id: 'm1', source: 'mock', mediaType: 'audio', title: 'Track 1' }
    const item2: PlayableMediaItem = { id: 'm2', source: 'mock', mediaType: 'audio', title: 'Track 2' }
    const item3: PlayableMediaItem = { id: 'm3', source: 'mock', mediaType: 'audio', title: 'Track 3' }

    await engine.play([item1, item2, item3])
    expect(engine.getState().currentItem?.id).toBe('m1')
    expect(engine.getState().queue.map((i) => i.id)).toEqual(['m2', 'm3'])

    await engine.skipNext()
    expect(engine.getState().currentItem?.id).toBe('m2')
    expect(engine.getState().queue.map((i) => i.id)).toEqual(['m3'])
    expect(engine.getState().history.map((i) => i.id)).toEqual(['m1'])
  })

  it('supports volume and mute adjustments', () => {
    engine.setVolume(0.4)
    expect(engine.getState().volume).toBe(0.4)

    engine.toggleMute()
    expect(engine.getState().isMuted).toBe(true)

    engine.toggleMute()
    expect(engine.getState().isMuted).toBe(false)
  })

  it('notifies subscribers on state updates', async () => {
    const listener = vi.fn()
    const unsubscribe = engine.subscribe(listener)

    engine.setTheater(true)
    expect(listener).toHaveBeenCalled()
    expect(engine.getState().isTheater).toBe(true)

    unsubscribe()
    engine.setTheater(false)
    // Listener should not have been called again after unsubscribe
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('discards stale playback resolutions when rapid skip occurs (generational cancellation)', async () => {
    let resolveFirst: (val: any) => void = () => {}
    const slowFirstPromise = new Promise((resolve) => {
      resolveFirst = resolve
    })

    const fastSecondPromise = Promise.resolve({
      engine: 'html5-audio' as const,
      streamUrl: 'https://example.com/track2.mp3',
      playbackMethod: 'direct-play' as const,
    })

    const item1: PlayableMediaItem = { id: 'slow-1', source: 'mock', mediaType: 'audio', title: 'Slow Track 1' }
    const item2: PlayableMediaItem = { id: 'fast-2', source: 'mock', mediaType: 'audio', title: 'Fast Track 2' }

    mockAdapter.resolvePlayback = vi.fn().mockImplementation((item: PlayableMediaItem) => {
      if (item.id === 'slow-1') return slowFirstPromise
      return fastSecondPromise
    })

    // Start playing item1 (which hangs pending resolution)
    const playPromise1 = engine.play(item1)
    expect(engine.getState().currentItem?.id).toBe('slow-1')

    // Immediately trigger play on item2
    await engine.play(item2)
    expect(engine.getState().currentItem?.id).toBe('fast-2')
    expect(engine.getState().status).toBe('playing')

    // Now resolve the slow first item belatedly
    resolveFirst({
      engine: 'html5-audio',
      streamUrl: 'https://example.com/track1.mp3',
      playbackMethod: 'direct-play',
    })
    await playPromise1

    // Engine must still be on fast-2, NOT overwritten by stale slow-1
    expect(engine.getState().currentItem?.id).toBe('fast-2')
  })

  it('automatically advances to next queue item when video finishes (ended event)', async () => {
    const video1: PlayableMediaItem = {
      id: 'ep1',
      source: 'mock',
      mediaType: 'video',
      title: 'Episode 1',
    }
    const video2: PlayableMediaItem = {
      id: 'ep2',
      source: 'mock',
      mediaType: 'video',
      title: 'Episode 2',
    }

    mockAdapter.resolvePlayback = vi.fn().mockResolvedValue({
      engine: 'html5-video' as const,
      streamUrl: 'https://example.com/ep.mp4',
      playbackMethod: 'direct-play' as const,
    })

    const mockVideoEl = document.createElement('video')
    engine.registerVideoElement(mockVideoEl)

    await engine.play([video1, video2])
    expect(engine.getState().currentItem?.id).toBe('ep1')
    expect(engine.getState().queue.map((i) => i.id)).toEqual(['ep2'])

    // Dispatch native 'ended' event on video element
    mockVideoEl.dispatchEvent(new Event('ended'))

    // Allow async handleItemEnded -> skipNext to resolve
    await Promise.resolve()
    await Promise.resolve()

    expect(engine.getState().currentItem?.id).toBe('ep2')
    expect(engine.getState().queue).toEqual([])
    expect(engine.getState().history.map((i) => i.id)).toEqual(['ep1'])
  })

  it('advances to next queue item via onVideoEnded callback', async () => {
    const video1: PlayableMediaItem = {
      id: 'ep1',
      source: 'mock',
      mediaType: 'video',
      title: 'Episode 1',
    }
    const video2: PlayableMediaItem = {
      id: 'ep2',
      source: 'mock',
      mediaType: 'video',
      title: 'Episode 2',
    }

    mockAdapter.resolvePlayback = vi.fn().mockResolvedValue({
      engine: 'html5-video' as const,
      streamUrl: 'https://example.com/ep.mp4',
      playbackMethod: 'direct-play' as const,
    })

    await engine.play([video1, video2])
    expect(engine.getState().currentItem?.id).toBe('ep1')

    engine.onVideoEnded()
    await Promise.resolve()
    await Promise.resolve()

    expect(engine.getState().currentItem?.id).toBe('ep2')
  })
})
