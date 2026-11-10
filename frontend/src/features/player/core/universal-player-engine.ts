import type {
  PlayableMediaItem,
  ResolvedPlayback,
  MediaSourceAdapter,
  PlayerStatus,
  PlayerViewMode,
  RepeatMode,
  StreamQualityOption,
  AudioTrack,
  SubtitleTrack,
  PlaybackMethod,
} from '../types'
import { adapterRegistry } from '../adapters'
import { DEFAULT_QUALITY_ID } from '@/features/media/utils/quality'
import { setActiveAudioElement } from '@/lib/player/utils'
import {
  savePlaybackSessionThrottled,
  savePlaybackSessionImmediate,
  clearPlaybackSession,
  getSavedPlaybackSession,
  registerAutoResumeUserGesture,
} from '@/features/music/visualizers/utils/playback-persistence'
import type { PersistentPlaybackSession } from '@/features/music/visualizers/types'
import { trackToPlayableItem } from '../utils/converters'
import { setActivePlaybackUrl } from '@/features/music/utils/blob-url-cache'

export interface UniversalEngineState {
  currentItem: PlayableMediaItem | null
  status: PlayerStatus
  viewMode: PlayerViewMode
  position: number
  duration: number
  buffered: number
  volume: number
  playbackSpeed: number
  isMuted: boolean
  isTheater: boolean
  isZoomedOut: boolean
  isInAppPip: boolean
  isOverallPip: boolean
  isOverallPipSupported: boolean
  queue: PlayableMediaItem[]
  history: PlayableMediaItem[]
  repeatMode: RepeatMode
  isShuffled: boolean
  activeAudio: AudioTrack | null
  activeSubtitle: SubtitleTrack | null
  currentQuality: string
  availableQualities: StreamQualityOption[]
  activeLevelHeight: number | null
  playbackMethod: PlaybackMethod
  error: string | null
}

export type StateListener = (state: UniversalEngineState) => void

const UNIFIED_VOLUME_KEY = 'otix_player_volume'
const UNIFIED_MUTED_KEY = 'otix_player_muted'

export interface PlayOptions {
  preserveQueue?: boolean
  customQueue?: PlayableMediaItem[]
  customHistory?: PlayableMediaItem[]
  startPosition?: number
  autoplay?: boolean
}

export class UniversalPlayerEngine {
  private state: UniversalEngineState
  private listeners = new Set<StateListener>()
  private activeAdapter: MediaSourceAdapter | null = null
  private resolvedPlayback: ResolvedPlayback | null = null
  private playSessionId = ''
  private playSessionToken = 0
  private preloadedNext: { itemId: string; resolved: ResolvedPlayback } | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private unShuffledQueue: PlayableMediaItem[] = []

  // Underlying audio element (for audio playback)
  private audioElement: HTMLAudioElement | null = null

  // Underlying video element ref (registered by UI when cinema/pip mounts)
  private videoElement: HTMLVideoElement | null = null

  constructor() {
    let savedVol = 0.7
    let savedMuted = false

    if (typeof localStorage !== 'undefined') {
      try {
        const v = localStorage.getItem(UNIFIED_VOLUME_KEY)
        if (v) savedVol = parseFloat(v)
        const m = localStorage.getItem(UNIFIED_MUTED_KEY)
        if (m) savedMuted = m === 'true'
      } catch {
        // Ignore localStorage errors
      }
    }

    const pipSupported =
      typeof document !== 'undefined' && Boolean(document.pictureInPictureEnabled)

    this.state = {
      currentItem: null,
      status: 'idle',
      viewMode: 'hidden',
      position: 0,
      duration: 0,
      buffered: 0,
      volume: isNaN(savedVol) ? 0.7 : savedVol,
      playbackSpeed: 1,
      isMuted: savedMuted,
      isTheater: false,
      isZoomedOut: false,
      isInAppPip: false,
      isOverallPip: false,
      isOverallPipSupported: pipSupported,
      queue: [],
      history: [],
      repeatMode: 'off',
      isShuffled: false,
      activeAudio: null,
      activeSubtitle: null,
      currentQuality: DEFAULT_QUALITY_ID,
      availableQualities: [],
      activeLevelHeight: null,
      playbackMethod: 'direct-play',
      error: null,
    }

    this.initAudioElement()
  }

  private initAudioElement() {
    if (typeof Audio === 'undefined') return
    try {
      this.audioElement = new Audio()
      this.audioElement.volume = this.state.isMuted ? 0 : this.state.volume
      setActiveAudioElement(this.audioElement)

      this.audioElement.addEventListener('timeupdate', () => {
        if (!this.audioElement || this.state.currentItem?.mediaType !== 'audio') return
        this.updateState({
          position: this.audioElement.currentTime,
          duration: this.audioElement.duration || this.state.duration,
        })
        this.saveCurrentSession(false)
      })

      this.audioElement.addEventListener('progress', () => {
        if (!this.audioElement || this.audioElement.buffered.length === 0) return
        const buf = this.audioElement.buffered.end(this.audioElement.buffered.length - 1)
        this.updateState({ buffered: buf })
      })

      this.audioElement.addEventListener('playing', () => {
        if (this.state.currentItem?.mediaType === 'audio') {
          setActiveAudioElement(this.audioElement)
          this.updateState({ status: 'playing' })
          this.saveCurrentSession(true)
        }
      })

      this.audioElement.addEventListener('pause', () => {
        if (this.state.currentItem?.mediaType === 'audio' && this.state.status === 'playing') {
          this.updateState({ status: 'paused' })
          this.saveCurrentSession(true)
        }
      })

      this.audioElement.addEventListener('ended', () => {
        if (this.state.currentItem?.mediaType === 'audio') {
          void this.handleItemEnded()
        }
      })

      this.audioElement.addEventListener('error', () => {
        if (this.audioElement?.error && this.state.currentItem?.mediaType === 'audio') {
          this.updateState({
            status: 'error',
            error: 'Playback error encountered on audio track',
          })
        }
      })
    } catch {
      // Audio element creation unavailable in SSR/node
    }
  }

  getState(): UniversalEngineState {
    return this.state
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private updateState(partial: Partial<UniversalEngineState>) {
    this.state = { ...this.state, ...partial }
    for (const listener of this.listeners) {
      listener(this.state)
    }
    this.syncMediaSession()
  }

  registerVideoElement(el: HTMLVideoElement | null) {
    this.videoElement = el
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement
  }

  getResolvedPlayback(): ResolvedPlayback | null {
    return this.resolvedPlayback
  }

  getPlaySessionId(): string {
    return this.playSessionId
  }

  // --------------------------------------------------------------------------
  // AUDIO FOCUS & PLAYBACK DISPATCH
  // --------------------------------------------------------------------------
  async play(
    itemInput?: PlayableMediaItem | PlayableMediaItem[],
    options?: PlayOptions,
  ): Promise<void> {
    if (!itemInput) {
      this.resume()
      return
    }

    const items = Array.isArray(itemInput) ? itemInput : [itemInput]
    if (items.length === 0) return

    const targetItem = items[0]
    const upcomingQueue =
      options?.customQueue !== undefined
        ? options.customQueue
        : options?.preserveQueue
        ? this.state.queue
        : Array.isArray(itemInput)
        ? items.slice(1)
        : this.state.queue

    const upcomingHistory =
      options?.customHistory !== undefined ? options.customHistory : this.state.history

    // Increment session generation token for VLC-style race-condition immunity
    const sessionToken = ++this.playSessionToken

    // Stop and clear previous playback (AUDIO FOCUS ENFORCEMENT)
    this.stopInternal(false)

    this.playSessionId = `otix-session-${Date.now().toString(36)}`
    this.activeAdapter = adapterRegistry.resolve(targetItem)

    const viewMode: PlayerViewMode =
      targetItem.mediaType === 'video' ? 'cinema' : 'minibar'

    this.updateState({
      currentItem: targetItem,
      status: 'loading',
      viewMode,
      error: null,
      position: options?.startPosition ?? targetItem.startPosition ?? 0,
      duration: targetItem.duration || 0,
      queue: upcomingQueue,
      history: upcomingHistory,
      activeAudio: null,
      activeSubtitle: null,
    })

    if (options?.customQueue !== undefined && this.state.isShuffled) {
      this.unShuffledQueue = this.unShuffledQueue.filter(
        (t) => t !== targetItem && t.id !== targetItem.id,
      )
    } else {
      this.unShuffledQueue = [...upcomingQueue]
    }

    try {
      // Fast path: use preloaded lookahead resolution if available
      let resolved: ResolvedPlayback
      if (this.preloadedNext && this.preloadedNext.itemId === targetItem.id) {
        resolved = this.preloadedNext.resolved
        this.preloadedNext = null
      } else {
        resolved = await this.activeAdapter.resolvePlayback(targetItem, {
          startPosition: options?.startPosition ?? targetItem.startPosition,
        })
      }

      // If user skipped or triggered another play while resolution was in-flight, discard stale result
      if (this.playSessionToken !== sessionToken) {
        return
      }

      this.resolvedPlayback = resolved

      const activeAudio =
        resolved.audioTracks?.find((a) => a.index === resolved.activeAudioIndex) ||
        resolved.audioTracks?.[0] ||
        null

      const activeSubtitle =
        resolved.subtitleTracks?.find((s) => s.index === resolved.activeSubtitleIndex) ||
        null

      if (resolved.streamUrl) {
        setActivePlaybackUrl(resolved.streamUrl)
      }

      // If audio, start HTMLAudioElement
      if (resolved.engine === 'html5-audio' && this.audioElement && resolved.streamUrl) {
        this.audioElement.src = resolved.streamUrl
        this.audioElement.currentTime = options?.startPosition ?? targetItem.startPosition ?? 0
        this.audioElement.playbackRate = this.state.playbackSpeed

        try {
          await this.audioElement.play()
          this.updateState({
            status: 'playing',
            availableQualities: resolved.availableQualities || [],
            playbackMethod: resolved.playbackMethod || 'direct-play',
            activeAudio,
            activeSubtitle,
          })
        } catch (err: any) {
          if (err?.name === 'NotAllowedError') {
            // Browser autoplay restrictions blocked immediate playback.
            // Mark state as paused so the UI shows the Play button and subsequent user interaction will play.
            this.updateState({
              status: 'paused',
              availableQualities: resolved.availableQualities || [],
              playbackMethod: resolved.playbackMethod || 'direct-play',
              activeAudio,
              activeSubtitle,
            })
            // Register auto-resume on first user gesture
            registerAutoResumeUserGesture(() => {
              if (this.state.status === 'paused') {
                this.resume()
              }
            })
          } else {
            this.updateState({
              status: 'error',
              error: err?.message || 'Playback error encountered on audio track',
              availableQualities: resolved.availableQualities || [],
              playbackMethod: resolved.playbackMethod || 'direct-play',
              activeAudio,
              activeSubtitle,
            })
          }
        }
      } else if (resolved.engine === 'html5-audio' && (!resolved.streamUrl || !this.audioElement)) {
        this.updateState({
          status: 'error',
          error: `Audio file "${targetItem.title || 'Track'}" is not accessible. Please re-import or select folder.`,
        })
      } else {
        this.updateState({
          status: 'playing',
          availableQualities: resolved.availableQualities || [],
          playbackMethod: resolved.playbackMethod || 'direct-play',
          activeAudio,
          activeSubtitle,
        })
      }

      this.startHeartbeat()

      // VLC-style Lookahead: Pre-resolve the next audio track in queue in the background
      void this.preloadNextQueueItem()
    } catch (err: any) {
      if (this.playSessionToken !== sessionToken) {
        return
      }
      this.updateState({
        status: 'error',
        error: err?.message || 'Failed to resolve media playback',
      })
    }
  }

  pause(): void {
    if (this.state.status !== 'playing') return

    if (this.state.currentItem?.mediaType === 'audio' && this.audioElement) {
      this.audioElement.pause()
    } else if (this.videoElement) {
      this.videoElement.pause()
    }

    this.updateState({ status: 'paused' })
    void this.reportProgress('paused')
  }

  resume(): void {
    if (this.state.status !== 'paused' && !this.audioElement?.paused && !this.videoElement?.paused) return

    if (this.state.currentItem?.mediaType === 'audio' && this.audioElement) {
      this.audioElement
        .play()
        .then(() => {
          this.updateState({ status: 'playing' })
          void this.reportProgress('playing')
        })
        .catch((err) => {
          console.warn('[universalPlayerEngine] resume failed:', err)
        })
      return
    } else if (this.videoElement) {
      this.videoElement
        .play()
        .then(() => {
          this.updateState({ status: 'playing' })
          void this.reportProgress('playing')
        })
        .catch((err) => {
          console.warn('[universalPlayerEngine] resume video failed:', err)
        })
      return
    }

    this.updateState({ status: 'playing' })
    void this.reportProgress('playing')
  }

  async togglePlay(): Promise<void> {
    const isAudioActuallyPaused =
      this.state.currentItem?.mediaType === 'audio' && this.audioElement
        ? this.audioElement.paused
        : false

    if (this.state.status === 'playing' && !isAudioActuallyPaused) {
      this.pause()
    } else if (this.state.status === 'paused' || isAudioActuallyPaused) {
      this.resume()
    } else if (this.state.status === 'idle' && this.state.currentItem) {
      await this.play(this.state.currentItem)
    }
  }

  private stopInternal(resetViewMode = true): void {
    setActivePlaybackUrl(null)
    this.stopHeartbeat()
    this.preloadedNext = null

    if (this.audioElement) {
      this.audioElement.pause()
      this.audioElement.src = ''
    }

    if (this.videoElement) {
      this.videoElement.pause()
      this.videoElement.src = ''
    }

    if (this.activeAdapter && this.state.currentItem) {
      void this.reportProgress('stopped')
    }

    this.activeAdapter = null
    this.resolvedPlayback = null

    this.updateState({
      status: 'idle',
      viewMode: resetViewMode ? 'hidden' : this.state.viewMode,
      position: 0,
      duration: 0,
      buffered: 0,
      error: null,
    })
  }

  private async preloadNextQueueItem(): Promise<void> {
    const nextItem = this.state.queue[0]
    if (!nextItem || nextItem.mediaType !== 'audio') {
      this.preloadedNext = null
      return
    }

    try {
      const adapter = adapterRegistry.resolve(nextItem)
      const resolved = await adapter.resolvePlayback(nextItem)
      if (this.state.queue[0]?.id === nextItem.id) {
        this.preloadedNext = {
          itemId: nextItem.id,
          resolved,
        }
      }
    } catch {
      this.preloadedNext = null
    }
  }

  stop(): void {
    clearPlaybackSession()
    this.stopInternal(true)
    this.updateState({ currentItem: null })
  }

  seek(seconds: number): void {
    const target = Math.max(0, Math.min(seconds, this.state.duration || seconds))

    if (this.state.currentItem?.mediaType === 'audio' && this.audioElement) {
      this.audioElement.currentTime = target
    } else if (this.videoElement) {
      this.videoElement.currentTime = target
    }

    this.updateState({ position: target })
    void this.reportProgress(this.state.status === 'playing' ? 'playing' : 'paused')
  }

  seekRelative(offsetSeconds: number): void {
    this.seek(this.state.position + offsetSeconds)
  }

  // --------------------------------------------------------------------------
  // QUEUE & AUTO-ADVANCE
  // --------------------------------------------------------------------------
  async skipNext(): Promise<void> {
    if (this.state.queue.length === 0) {
      // Check if adapter can resolve next item (e.g. Plex next episode)
      if (this.activeAdapter?.getNextItem && this.state.currentItem) {
        const nextEpisode = await this.activeAdapter.getNextItem(this.state.currentItem)
        if (nextEpisode) {
          await this.play(nextEpisode)
          return
        }
      }

      if (this.state.repeatMode === 'all') {
        const all = [...this.state.history, ...(this.state.currentItem ? [this.state.currentItem] : [])]
        if (all.length > 0) {
          this.updateState({ history: [] })
          await this.play(all)
          return
        }
      }
      this.stop()
      return
    }

    const nextItem = this.state.queue[0]
    const remainingQueue = this.state.queue.slice(1)
    const newHistory = this.state.currentItem
      ? [...this.state.history, this.state.currentItem]
      : this.state.history

    await this.play(nextItem, {
      customQueue: remainingQueue,
      customHistory: newHistory,
    })
  }

  async skipPrevious(): Promise<void> {
    // If more than 3 seconds in, restart track
    if (this.state.position > 3) {
      this.seek(0)
      return
    }

    if (this.state.history.length === 0) {
      this.seek(0)
      return
    }

    const prevItem = this.state.history[this.state.history.length - 1]
    const remainingHistory = this.state.history.slice(0, -1)
    const newQueue = this.state.currentItem
      ? [this.state.currentItem, ...this.state.queue]
      : this.state.queue

    await this.play(prevItem, {
      customQueue: newQueue,
      customHistory: remainingHistory,
    })
  }

  async skipToIndex(index: number): Promise<void> {
    if (index < 0 || index >= this.state.queue.length) return
    const targetItem = this.state.queue[index]
    const newQueue = this.state.queue.slice(index + 1)
    const skipped = this.state.queue.slice(0, index)
    const newHistory = this.state.currentItem
      ? [...this.state.history, this.state.currentItem, ...skipped]
      : [...this.state.history, ...skipped]

    await this.play(targetItem, {
      customQueue: newQueue,
      customHistory: newHistory,
    })
  }

  addToQueue(item: PlayableMediaItem | PlayableMediaItem[]): void {
    const items = Array.isArray(item) ? item : [item]
    this.updateState({
      queue: [...this.state.queue, ...items],
    })
    this.unShuffledQueue = [...this.unShuffledQueue, ...items]
  }

  removeFromQueue(index: number): void {
    if (index < 0 || index >= this.state.queue.length) return
    const removedItem = this.state.queue[index]
    const newQueue = [...this.state.queue]
    newQueue.splice(index, 1)
    this.updateState({ queue: newQueue })
    if (this.state.isShuffled) {
      this.unShuffledQueue = this.unShuffledQueue.filter(
        (item) => item !== removedItem && item.id !== removedItem.id,
      )
    } else {
      this.unShuffledQueue = newQueue
    }
  }

  moveQueueItem(fromIndex: number, toIndex: number): void {
    if (
      fromIndex < 0 ||
      fromIndex >= this.state.queue.length ||
      toIndex < 0 ||
      toIndex >= this.state.queue.length
    ) {
      return
    }
    const newQueue = [...this.state.queue]
    const [moved] = newQueue.splice(fromIndex, 1)
    newQueue.splice(toIndex, 0, moved)
    this.updateState({ queue: newQueue })
  }

  clearQueue(): void {
    this.updateState({ queue: [] })
    this.unShuffledQueue = []
  }

  toggleShuffle(): void {
    const newShuffle = !this.state.isShuffled
    if (newShuffle) {
      this.unShuffledQueue = [...this.state.queue]
      const shuffled = [...this.state.queue].sort(() => Math.random() - 0.5)
      this.updateState({ isShuffled: true, queue: shuffled })
    } else {
      this.updateState({ isShuffled: false, queue: this.unShuffledQueue })
    }
  }

  setRepeatMode(mode: RepeatMode): void {
    this.updateState({ repeatMode: mode })
  }

  private async handleItemEnded(): Promise<void> {
    if (this.state.repeatMode === 'one') {
      this.seek(0)
      this.resume()
      return
    }
    await this.skipNext()
  }

  // --------------------------------------------------------------------------
  // VOLUME & PRESENTATION
  // --------------------------------------------------------------------------
  setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume))
    if (this.audioElement) {
      this.audioElement.volume = this.state.isMuted ? 0 : clamped
    }
    if (this.videoElement) {
      this.videoElement.volume = this.state.isMuted ? 0 : clamped
    }
    this.updateState({ volume: clamped })

    try {
      localStorage.setItem(UNIFIED_VOLUME_KEY, String(clamped))
    } catch {
      // ignore
    }
  }

  toggleMute(): void {
    const newMuted = !this.state.isMuted
    if (this.audioElement) {
      this.audioElement.volume = newMuted ? 0 : this.state.volume
    }
    if (this.videoElement) {
      this.videoElement.volume = newMuted ? 0 : this.state.volume
    }
    this.updateState({ isMuted: newMuted })

    try {
      localStorage.setItem(UNIFIED_MUTED_KEY, String(newMuted))
    } catch {
      // ignore
    }
  }

  setPlaybackSpeed(speed: number): void {
    if (this.audioElement) {
      this.audioElement.playbackRate = speed
    }
    if (this.videoElement) {
      this.videoElement.playbackRate = speed
    }
    this.updateState({ playbackSpeed: speed })
  }

  setViewMode(mode: PlayerViewMode): void {
    this.updateState({ viewMode: mode })
  }

  setTheater(isTheater: boolean): void {
    this.updateState({ isTheater })
  }

  toggleTheater(): void {
    this.updateState({ isTheater: !this.state.isTheater })
  }

  setZoomedOut(isZoomedOut: boolean): void {
    this.updateState({ isZoomedOut })
  }

  toggleZoom(): void {
    this.updateState({ isZoomedOut: !this.state.isZoomedOut })
  }

  setInAppPip(pip: boolean): void {
    this.updateState({
      isInAppPip: pip,
      viewMode: pip ? 'pip' : 'cinema',
    })
  }

  toggleInAppPip(): void {
    this.setInAppPip(!this.state.isInAppPip)
  }

  async toggleOverallPip(): Promise<void> {
    if (typeof document === 'undefined') return

    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture().catch(() => {})
      this.updateState({ isOverallPip: false })
    } else if (this.videoElement && document.pictureInPictureEnabled) {
      await this.videoElement.requestPictureInPicture().catch(() => {})
      this.updateState({ isOverallPip: true })
    }
  }

  // --------------------------------------------------------------------------
  // TRACKS & QUALITY
  // --------------------------------------------------------------------------
  async setActiveSubtitle(subtitleId: string | null): Promise<void> {
    const sub = subtitleId
      ? this.resolvedPlaybackSubtitleTracks()?.find((s) => s.id === subtitleId) || null
      : null

    this.updateState({ activeSubtitle: sub })

    if (this.activeAdapter?.changeTracks && this.state.currentItem) {
      const resolved = await this.activeAdapter.changeTracks(
        this.state.currentItem,
        this.state.activeAudio?.index,
        sub?.index,
      )
      this.resolvedPlayback = resolved
      this.updateState({
        playbackMethod: resolved.playbackMethod || this.state.playbackMethod,
      })
    }
  }

  private resolvedPlaybackSubtitleTracks(): SubtitleTrack[] | undefined {
    return this.resolvedPlayback?.subtitleTracks
  }

  async setActiveAudio(audioIndex: number | null): Promise<void> {
    const audio = audioIndex != null
      ? this.resolvedPlayback?.audioTracks?.find((a) => a.index === audioIndex) || null
      : null

    this.updateState({ activeAudio: audio })

    if (this.activeAdapter?.changeTracks && this.state.currentItem && audioIndex != null) {
      const resolved = await this.activeAdapter.changeTracks(
        this.state.currentItem,
        audioIndex,
        this.state.activeSubtitle?.index,
      )
      this.resolvedPlayback = resolved
    }
  }

  async setQuality(qualityId: string): Promise<void> {
    const qual = this.state.availableQualities.find((q) => q.id === qualityId)
    if (!qual || !this.activeAdapter?.changeQuality || !this.state.currentItem) {
      this.updateState({ currentQuality: qualityId })
      return
    }

    this.updateState({ currentQuality: qualityId })
    const resolved = await this.activeAdapter.changeQuality(
      this.state.currentItem,
      qual,
      this.state.position,
    )
    this.resolvedPlayback = resolved
  }

  async failoverServer(newBaseUrl: string): Promise<void> {
    if (!this.activeAdapter?.failoverServer || !this.state.currentItem) return
    const nextUrl = await this.activeAdapter.failoverServer(newBaseUrl, this.state.currentItem)
    if (nextUrl) {
      const resolved = await this.activeAdapter.resolvePlayback(this.state.currentItem, {
        startPosition: this.state.position,
      })
      this.resolvedPlayback = resolved
    }
  }

  // --------------------------------------------------------------------------
  // HEARTBEAT & SCROBBLING
  // --------------------------------------------------------------------------
  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.state.status === 'playing') {
        void this.reportProgress('playing')
      }
    }, 10_000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private async reportProgress(state: 'playing' | 'paused' | 'stopped'): Promise<void> {
    if (!this.activeAdapter?.reportProgress || !this.state.currentItem) return
    await this.activeAdapter.reportProgress({
      item: this.state.currentItem,
      positionSeconds: this.state.position,
      durationSeconds: this.state.duration,
      state,
      sessionId: this.playSessionId,
    })
  }

  // --------------------------------------------------------------------------
  // MEDIASESSION API
  // --------------------------------------------------------------------------
  private syncMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    const item = this.state.currentItem
    if (!item || this.state.status === 'idle') {
      navigator.mediaSession.metadata = null
      return
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title,
      artist: item.subtitle || item.albumOrShowTitle || 'Otix',
      album: item.albumOrShowTitle || undefined,
      artwork: item.artworkUrl
        ? [
            { src: item.artworkUrl, sizes: '96x96' },
            { src: item.artworkUrl, sizes: '256x256' },
            { src: item.artworkUrl, sizes: '512x512' },
          ]
        : [],
    })

    navigator.mediaSession.playbackState =
      this.state.status === 'playing' ? 'playing' : this.state.status === 'paused' ? 'paused' : 'none'

    try {
      navigator.mediaSession.setActionHandler('play', () => this.resume())
      navigator.mediaSession.setActionHandler('pause', () => this.pause())
      navigator.mediaSession.setActionHandler('previoustrack', () => void this.skipPrevious())
      navigator.mediaSession.setActionHandler('nexttrack', () => void this.skipNext())
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) this.seek(details.seekTime)
      })
    } catch {
      // Some browsers don't support all mediaSession actions
    }
  }

  // --------------------------------------------------------------------------
  // SESSION PERSISTENCE & AUTO-RESUME
  // --------------------------------------------------------------------------
  private saveCurrentSession(immediate = false) {
    if (typeof localStorage === 'undefined') return
    const item = this.state.currentItem
    if (!item || item.mediaType !== 'audio' || this.state.status === 'idle') return

    const session: PersistentPlaybackSession = {
      source: (item.source as any) || 'local',
      track: {
        id: item.id,
        title: item.title,
        artist: item.subtitle || '',
        albumName: item.albumOrShowTitle || '',
        albumArt: item.artworkUrl || null,
        durationMs: Math.round((item.duration || this.state.duration || 0) * 1000),
        ratingKey: item.providerData?.ratingKey,
        serverId: item.providerData?.serverId,
        partKey: item.providerData?.partKey,
        path: item.providerData?.path,
        url: item.providerData?.url,
      },
      queue: this.state.queue.map((q) => ({
        id: q.id,
        title: q.title,
        artist: q.subtitle || '',
        albumName: q.albumOrShowTitle || '',
        albumArt: q.artworkUrl || null,
        durationMs: Math.round((q.duration || 0) * 1000),
        ratingKey: q.providerData?.ratingKey,
        serverId: q.providerData?.serverId,
        partKey: q.providerData?.partKey,
        path: q.providerData?.path,
        url: q.providerData?.url,
      })),
      positionMs: Math.round(this.state.position * 1000),
      durationMs: Math.round(this.state.duration * 1000),
      status: this.state.status === 'playing' ? 'playing' : 'paused',
      repeatMode: this.state.repeatMode,
      isShuffled: this.state.isShuffled,
      volume: this.state.volume,
      savedAt: Date.now(),
    }

    if (immediate) {
      savePlaybackSessionImmediate(session)
    } else {
      savePlaybackSessionThrottled(session)
    }
  }

  public async restoreSession(): Promise<boolean> {
    const saved = getSavedPlaybackSession()
    if (!saved || !saved.track || !saved.track.id) return false

    // Ignore sessions older than 7 days
    if (Date.now() - saved.savedAt > 7 * 24 * 60 * 60 * 1000) {
      clearPlaybackSession()
      return false
    }

    const mainItem = trackToPlayableItem(saved.track, saved.source)
    const upcomingQueue = saved.queue.map((t) => trackToPlayableItem(t, saved.source))

    if (saved.status === 'playing') {
      try {
        await this.play(mainItem, {
          startPosition: saved.positionMs / 1000,
          customQueue: upcomingQueue,
          autoplay: true,
        })
      } catch {
        // Fall back to gesture registration if browser blocks autoplay
        registerAutoResumeUserGesture(() => {
          this.resume()
        })
      }
      return true
    } else {
      this.updateState({
        currentItem: mainItem,
        queue: upcomingQueue,
        status: 'paused',
        viewMode: 'minibar',
        position: saved.positionMs / 1000,
        duration: saved.durationMs / 1000,
        repeatMode: saved.repeatMode,
        isShuffled: saved.isShuffled,
      })
      return true
    }
  }
}

export const universalPlayerEngine = new UniversalPlayerEngine()
