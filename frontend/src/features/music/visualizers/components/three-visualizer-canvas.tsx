import { useEffect, useRef, useState } from 'react'
import type { VisualizerMode } from '../types'
import { ThreeSceneManager } from '../utils/three-scene-manager'
import { audioVisualizerEngine } from '../utils/audio-analyzer'
import { paletteToSceneTheme, buildFallbackMusicPlayerTheme } from '../utils/visualizer-helpers'
import { Simple2DVisualizerCanvas } from './simple-2d-visualizer-canvas'
import type { ExtractedPalette } from '@/features/activity/hooks/use-palette'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'

export interface ThreeVisualizerCanvasProps {
  mode: VisualizerMode
  palette: ExtractedPalette
  hasArtwork?: boolean
  musicTheme?: MusicPlayerTheme
  positionMs: number
  durationMs: number
  isPlaying: boolean
  intensity?: number
  className?: string
}

export const ThreeVisualizerCanvas = ({
  mode,
  palette,
  hasArtwork,
  musicTheme,
  positionMs,
  durationMs,
  isPlaying,
  intensity = 1.0,
  className,
}: ThreeVisualizerCanvasProps) => {
  const [hasError, setHasError] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const managerRef = useRef<ThreeSceneManager | null>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const propsRef = useRef({ mode, palette, hasArtwork, positionMs, durationMs, isPlaying, intensity })

  useEffect(() => {
    propsRef.current = { mode, palette, hasArtwork, positionMs, durationMs, isPlaying, intensity }
  }, [mode, palette, hasArtwork, positionMs, durationMs, isPlaying, intensity])

  useEffect(() => {
    if (hasError) return
    const canvas = canvasRef.current
    if (!canvas) return

    const parent = canvas.parentElement
    const initialWidth = parent ? parent.clientWidth : window.innerWidth
    const initialHeight = parent ? parent.clientHeight : window.innerHeight

    let manager: ThreeSceneManager | null = null
    try {
      manager = new ThreeSceneManager(canvas, initialWidth, initialHeight)
      managerRef.current = manager

      const theme = paletteToSceneTheme(palette, hasArtwork)
      manager.switchMode(mode, theme)
    } catch (err) {
      console.warn('WebGL initialization failed, falling back to 2D visualizer:', err)
      setHasError(true)
      return
    }

    const handleResize = () => {
      if (!canvas.parentElement || !managerRef.current) return
      const w = canvas.parentElement.clientWidth
      const h = canvas.parentElement.clientHeight
      managerRef.current.setSize(w, h)
    }

    const resizeObserver = new ResizeObserver(handleResize)
    if (canvas.parentElement) {
      resizeObserver.observe(canvas.parentElement)
    }

    const handlePointerMove = (e: MouseEvent) => {
      const normX = (e.clientX / window.innerWidth) * 2 - 1
      const normY = (e.clientY / window.innerHeight) * 2 - 1
      mouseRef.current = { x: normX, y: normY }
    }
    window.addEventListener('pointermove', handlePointerMove)

    let animId: number
    const loop = () => {
      if (!managerRef.current) return
      const p = propsRef.current
      const curTheme = paletteToSceneTheme(p.palette, p.hasArtwork)
      const rawFrame = audioVisualizerEngine.getAudioFrame(p.positionMs, p.durationMs, p.isPlaying)

      // Apply intensity scaling to frame
      const frame = {
        ...rawFrame,
        bass: Math.min(1, rawFrame.bass * p.intensity),
        mid: Math.min(1, rawFrame.mid * p.intensity),
        treble: Math.min(1, rawFrame.treble * p.intensity),
        energy: Math.min(1, rawFrame.energy * p.intensity),
        beat: Math.min(1, rawFrame.beat * p.intensity),
      }

      try {
        managerRef.current.render(frame, curTheme, mouseRef.current.x, mouseRef.current.y)
      } catch (err) {
        console.warn('ThreeSceneManager render failed, falling back to 2D visualizer:', err)
        cancelAnimationFrame(animId)
        setHasError(true)
        return
      }
      animId = requestAnimationFrame(loop)
    }

    animId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animId)
      resizeObserver.disconnect()
      window.removeEventListener('pointermove', handlePointerMove)
      if (managerRef.current) {
        managerRef.current.dispose()
        managerRef.current = null
      }
    }
  }, [hasError]) // Re-run if error cleared

  // Update mode or theme when changed
  useEffect(() => {
    if (managerRef.current && !hasError) {
      try {
        const theme = paletteToSceneTheme(palette, hasArtwork)
        managerRef.current.switchMode(mode, theme)
      } catch (err) {
        console.warn('Failed to switch visualizer mode:', err)
        setHasError(true)
      }
    }
  }, [mode, palette, hasArtwork, hasError])

  if (hasError) {
    return (
      <Simple2DVisualizerCanvas
        isPlaying={isPlaying}
        positionMs={positionMs}
        durationMs={durationMs}
        theme={musicTheme || buildFallbackMusicPlayerTheme(palette, hasArtwork)}
        className={className}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={className || 'absolute inset-0 h-full w-full pointer-events-auto touch-none cursor-grab active:cursor-grabbing'}
    />
  )
}
