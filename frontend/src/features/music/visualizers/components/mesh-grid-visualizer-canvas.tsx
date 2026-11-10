import { useRef, useEffect } from 'react'
import type { ExtractedPalette } from '@/features/activity/hooks/use-palette'
import { audioVisualizerEngine } from '../utils/audio-analyzer'
import {
  createMeshGridScene,
  type MeshGridSceneHandle,
  type MeshGridParams,
  DEFAULT_MESH_GRID_PARAMS,
} from '../utils/mesh-grid-helpers'
import { cn } from '@/lib/utils'

export interface MeshGridVisualizerCanvasProps {
  isPlaying: boolean
  positionMs: number
  durationMs: number
  trackId?: string | null
  albumArt?: string | null
  palette?: ExtractedPalette | null
  params?: Partial<MeshGridParams>
  onSceneReady?: (handle: MeshGridSceneHandle) => void
  className?: string
}

export const MeshGridVisualizerCanvas = ({
  isPlaying,
  positionMs,
  durationMs,
  trackId,
  albumArt,
  palette,
  params,
  onSceneReady,
  className,
}: MeshGridVisualizerCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sceneHandleRef = useRef<MeshGridSceneHandle | null>(null)
  const lastTimeRef = useRef<number>(performance.now())

  const posRef = useRef(positionMs)
  const durRef = useRef(durationMs)
  const playingRef = useRef(isPlaying)

  // Track keys to detect song changes and async palette extraction
  const prevTrackKeyRef = useRef<string | null>(null)
  const prevPaletteRef = useRef<ExtractedPalette | null>(null)

  useEffect(() => {
    posRef.current = positionMs
    durRef.current = durationMs
    playingRef.current = isPlaying
  }, [positionMs, durationMs, isPlaying])

  // Change colours ONLY when the song or its cover art changes, or when async palette extraction resolves
  useEffect(() => {
    const currentTrackKey = `${trackId ?? ''}::${albumArt ?? ''}`
    const isNewTrack = currentTrackKey !== prevTrackKeyRef.current
    const isNewPalette = palette && palette !== prevPaletteRef.current

    if (isNewTrack || isNewPalette) {
      prevTrackKeyRef.current = currentTrackKey
      if (palette) {
        prevPaletteRef.current = palette
      }
      if (sceneHandleRef.current) {
        sceneHandleRef.current.setAlbumTheme(palette ?? null)
      }
    }
  }, [trackId, albumArt, palette])

  // Dynamically update visualizer parameters when params prop changes
  useEffect(() => {
    if (sceneHandleRef.current && params) {
      sceneHandleRef.current.setParams(params, { updateCamera: false })
      audioVisualizerEngine.setConfig({
        fftSize: params.fftSize,
        smoothingTimeConstant: params.smoothingTimeConstant,
        sensitivity: params.sensitivity,
        gain: params.gain,
      })
    }
  }, [params])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let handle: MeshGridSceneHandle | null = null
    try {
      const initialConfig = params
        ? { ...DEFAULT_MESH_GRID_PARAMS, ...params }
        : DEFAULT_MESH_GRID_PARAMS
      handle = createMeshGridScene(canvas, initialConfig)
      sceneHandleRef.current = handle
      onSceneReady?.(handle)

      audioVisualizerEngine.setConfig({
        fftSize: initialConfig.fftSize,
        smoothingTimeConstant: initialConfig.smoothingTimeConstant,
        sensitivity: initialConfig.sensitivity,
        gain: initialConfig.gain,
      })

      // Ensure initial aspect ratio and projection matrix are accurate immediately
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        handle.resize(canvas.clientWidth, canvas.clientHeight)
      }

      // Set initial colors once on mount
      handle.setAlbumTheme(palette ?? null)
      prevTrackKeyRef.current = `${trackId ?? ''}::${albumArt ?? ''}`
      prevPaletteRef.current = palette ?? null
    } catch (err) {
      // In non-WebGL environments (e.g. headless vitest), handle remains null
      console.warn('[MeshGridVisualizerCanvas] WebGL scene init notice:', err)
      return
    }

    let animId: number

    const render = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1)
      lastTimeRef.current = now

      if (handle) {
        try {
          const frame = audioVisualizerEngine.getAudioFrame(
            posRef.current,
            durRef.current,
            playingRef.current,
          )

          // Strict: Only audio frequency array (high-res if active) and energies passed, zero palette work
          handle.updateFrame(
            dt,
            frame.highResFrequencyData ?? frame.frequencyData,
            frame.bass,
            frame.mid,
          )
        } catch (frameErr) {
          console.error('[MeshGridVisualizerCanvas] Error in frame update:', frameErr)
        }
      }

      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)

    const handleResize = () => {
      if (canvas && handle) {
        handle.resize(canvas.clientWidth, canvas.clientHeight)
      }
    }

    window.addEventListener('resize', handleResize)

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === canvas && handle) {
          handle.resize(canvas.clientWidth, canvas.clientHeight)
        }
      }
    })
    resizeObserver.observe(canvas)

    const handleDblClick = () => {
      if (handle) {
        handle.resetCamera()
      }
    }

    canvas.addEventListener('dblclick', handleDblClick)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('dblclick', handleDblClick)
      resizeObserver.disconnect()
      if (handle) {
        handle.dispose()
        sceneHandleRef.current = null
      }
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={cn('w-full h-full block bg-background cursor-grab active:cursor-grabbing', className)}
    />
  )
}
