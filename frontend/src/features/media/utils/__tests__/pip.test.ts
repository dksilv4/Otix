import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isOverallPipSupported,
  isOverallPipActive,
  requestOverallPip,
  exitOverallPip,
  toggleOverallPip,
  syncMediaSessionMetadata,
  syncMediaSessionPlaybackState,
  registerMediaSessionActions,
  calculatePipDragBounds,
  getNearestPipCorner,
  getPipCornerCoordinates,
} from '../pip'

describe('PiP utilities (pip.ts)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isOverallPipSupported', () => {
    it('returns true when document.pictureInPictureEnabled is true', () => {
      Object.defineProperty(document, 'pictureInPictureEnabled', {
        value: true,
        configurable: true,
      })
      expect(isOverallPipSupported()).toBe(true)
    })

    it('returns true when video has webkitSupportsPresentationMode', () => {
      Object.defineProperty(document, 'pictureInPictureEnabled', {
        value: false,
        configurable: true,
      })
      const video = document.createElement('video') as unknown as {
        webkitSupportsPresentationMode?: (mode: string) => boolean
      }
      video.webkitSupportsPresentationMode = vi.fn((mode) => mode === 'picture-in-picture')

      expect(isOverallPipSupported(video as unknown as HTMLVideoElement)).toBe(true)
    })
  })

  describe('isOverallPipActive', () => {
    it('returns true when document.pictureInPictureElement matches', () => {
      const video = document.createElement('video')
      Object.defineProperty(document, 'pictureInPictureElement', {
        value: video,
        configurable: true,
      })

      expect(isOverallPipActive(video)).toBe(true)
      expect(isOverallPipActive()).toBe(true)
    })

    it('returns false when document.pictureInPictureElement is null and not webkit pip', () => {
      Object.defineProperty(document, 'pictureInPictureElement', {
        value: null,
        configurable: true,
      })
      const video = document.createElement('video')
      expect(isOverallPipActive(video)).toBe(false)
    })

    it('returns true for WebKit presentation mode', () => {
      Object.defineProperty(document, 'pictureInPictureElement', {
        value: null,
        configurable: true,
      })
      const video = document.createElement('video') as unknown as {
        webkitPresentationMode?: string
      }
      video.webkitPresentationMode = 'picture-in-picture'

      expect(isOverallPipActive(video as unknown as HTMLVideoElement)).toBe(true)
    })
  })

  describe('requestOverallPip', () => {
    it('calls video.requestPictureInPicture when available', async () => {
      const video = document.createElement('video')
      video.requestPictureInPicture = vi.fn().mockResolvedValue({} as PictureInPictureWindow)

      await requestOverallPip(video)
      expect(video.requestPictureInPicture).toHaveBeenCalledTimes(1)
    })

    it('falls back to webkitSetPresentationMode on Safari iOS', async () => {
      const video = document.createElement('video') as unknown as {
        requestPictureInPicture?: () => Promise<unknown>
        webkitSupportsPresentationMode?: (mode: string) => boolean
        webkitSetPresentationMode?: (mode: string) => void
      }
      delete video.requestPictureInPicture
      video.webkitSupportsPresentationMode = vi.fn().mockReturnValue(true)
      video.webkitSetPresentationMode = vi.fn()

      await requestOverallPip(video as unknown as HTMLVideoElement)
      expect(video.webkitSetPresentationMode).toHaveBeenCalledWith('picture-in-picture')
    })
  })

  describe('exitOverallPip', () => {
    it('calls document.exitPictureInPicture when active', async () => {
      const exitMock = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(document, 'pictureInPictureElement', {
        value: document.createElement('video'),
        configurable: true,
      })
      Object.defineProperty(document, 'exitPictureInPicture', {
        value: exitMock,
        configurable: true,
      })

      await exitOverallPip()
      expect(exitMock).toHaveBeenCalledTimes(1)
    })

    it('calls webkitSetPresentationMode("inline") on Safari', async () => {
      Object.defineProperty(document, 'pictureInPictureElement', {
        value: null,
        configurable: true,
      })
      const video = document.createElement('video') as unknown as {
        webkitPresentationMode?: string
        webkitSetPresentationMode?: (mode: string) => void
      }
      video.webkitPresentationMode = 'picture-in-picture'
      video.webkitSetPresentationMode = vi.fn()

      await exitOverallPip(video as unknown as HTMLVideoElement)
      expect(video.webkitSetPresentationMode).toHaveBeenCalledWith('inline')
    })
  })

  describe('toggleOverallPip', () => {
    it('exits if currently active', async () => {
      const video = document.createElement('video')
      Object.defineProperty(document, 'pictureInPictureElement', {
        value: video,
        configurable: true,
      })
      const exitMock = vi.fn().mockResolvedValue(undefined)
      Object.defineProperty(document, 'exitPictureInPicture', {
        value: exitMock,
        configurable: true,
      })

      const result = await toggleOverallPip(video)
      expect(result).toBe(false)
      expect(exitMock).toHaveBeenCalled()
    })

    it('requests if not active', async () => {
      const video = document.createElement('video')
      Object.defineProperty(document, 'pictureInPictureElement', {
        value: null,
        configurable: true,
      })
      video.requestPictureInPicture = vi.fn().mockResolvedValue({} as PictureInPictureWindow)

      const result = await toggleOverallPip(video)
      expect(result).toBe(true)
      expect(video.requestPictureInPicture).toHaveBeenCalled()
    })
  })

  describe('MediaSession API', () => {
    it('sets metadata and action handlers safely', () => {
      const setActionHandler = vi.fn()
      const setPositionState = vi.fn()

      const mockMediaSession = {
        metadata: null,
        playbackState: 'none',
        setActionHandler,
        setPositionState,
      }

      Object.defineProperty(navigator, 'mediaSession', {
        value: mockMediaSession,
        configurable: true,
      })

      syncMediaSessionMetadata({
        title: 'Stranger Things',
        seriesTitle: 'Stranger Things',
        seasonNumber: 1,
        episodeNumber: 1,
        episodeTitle: 'Chapter One',
      })

      expect(mockMediaSession.metadata).not.toBeNull()

      syncMediaSessionPlaybackState(true, 42, 300, 1)
      expect(mockMediaSession.playbackState).toBe('playing')
      expect(setPositionState).toHaveBeenCalledWith({
        duration: 300,
        playbackRate: 1,
        position: 42,
      })

      const onPlay = vi.fn()
      const onPause = vi.fn()
      const onSeek = vi.fn()

      const cleanup = registerMediaSessionActions(
        { onPlay, onPause, onSeek },
        () => 42,
        () => 300,
      )

      expect(setActionHandler).toHaveBeenCalledWith('play', expect.any(Function))
      expect(setActionHandler).toHaveBeenCalledWith('pause', expect.any(Function))

      cleanup()
      expect(setActionHandler).toHaveBeenCalledWith('play', null)
    })
  })

  describe('Pip Dragging & Docking Calculations', () => {
    const testBounds = {
      viewportWidth: 1000,
      viewportHeight: 600,
      cardWidth: 300,
      cardHeight: 200,
      padding: 20,
    }

    it('calculates translation drag bounds correctly', () => {
      // availableW = 1000 - 300 - 40 = 660 -> minX = -660, maxX = 0
      // availableH = 600 - 200 - 40 = 360 -> minY = -360, maxY = 0
      const bounds = calculatePipDragBounds(testBounds)
      expect(bounds).toEqual({
        minX: -660,
        maxX: 0,
        minY: -360,
        maxY: 0,
      })
    })

    it('determines the nearest dock corner based on current translation', () => {
      // midpoint X: -330, midpoint Y: -180
      expect(getNearestPipCorner(-500, -300, testBounds)).toBe('top-left')
      expect(getNearestPipCorner(-100, -300, testBounds)).toBe('top-right')
      expect(getNearestPipCorner(-500, -50, testBounds)).toBe('bottom-left')
      expect(getNearestPipCorner(-50, -50, testBounds)).toBe('bottom-right')
    })

    it('returns corner target coordinates correctly', () => {
      expect(getPipCornerCoordinates('top-left', testBounds)).toEqual({ x: -660, y: -360 })
      expect(getPipCornerCoordinates('top-right', testBounds)).toEqual({ x: 0, y: -360 })
      expect(getPipCornerCoordinates('bottom-left', testBounds)).toEqual({ x: -660, y: 0 })
      expect(getPipCornerCoordinates('bottom-right', testBounds)).toEqual({ x: 0, y: 0 })
    })
  })
})
