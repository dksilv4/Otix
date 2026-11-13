import { useRef, useEffect } from 'react'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'
import { audioVisualizerEngine } from '../utils/audio-analyzer'
import {
  getFrequencyHeatmapColor,
  getStemPaletteColors,
  calculateStemEnergies,
} from '../utils/visualizer-helpers'
import { cn } from '@/lib/utils'

export interface Simple2DVisualizerCanvasProps {
  isPlaying: boolean
  positionMs: number
  durationMs: number
  theme: MusicPlayerTheme
  className?: string
}

export const Simple2DVisualizerCanvas = ({
  isPlaying,
  positionMs,
  durationMs,
  theme,
  className,
}: Simple2DVisualizerCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const posRef = useRef(positionMs)
  const durRef = useRef(durationMs)
  const playingRef = useRef(isPlaying)
  const themeRef = useRef(theme)

  const MAX_BARS = 160
  const smoothedHeightsRef = useRef<Float32Array>(new Float32Array(MAX_BARS))
  const peakCapsRef = useRef<Float32Array>(new Float32Array(MAX_BARS))
  const smoothedBassRef = useRef({ sub: 0 })
  const smoothedStemsRef = useRef({
    bass: 0,
    vocals: 0,
    instruments: 0,
    dominant: 'mix' as 'bass' | 'vocals' | 'instruments' | 'mix',
  })

  useEffect(() => {
    posRef.current = positionMs
    durRef.current = durationMs
    playingRef.current = isPlaying
    themeRef.current = theme
  }, [positionMs, durationMs, isPlaying, theme])

  useEffect(() => {
    let animId: number

    const render = () => {
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        if (ctx) {
          const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
          const rect = canvas.getBoundingClientRect()
          const width = rect.width
          const height = rect.height

          if (width > 0 && height > 0) {
            const pixelWidth = Math.round(width * dpr)
            const pixelHeight = Math.round(height * dpr)

            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
              canvas.width = pixelWidth
              canvas.height = pixelHeight
            }

            ctx.save()
            ctx.scale(dpr, dpr)
            ctx.clearRect(0, 0, width, height)

            const currentPos = posRef.current
            const currentDur = durRef.current
            const isAudioPlaying = playingRef.current
            const currentTheme = themeRef.current

            const frame = audioVisualizerEngine.getAudioFrame(currentPos, currentDur, isAudioPlaying)
            const freqData = frame.frequencyData
            const waveData = frame.waveformData

            const smoothedHeights = smoothedHeightsRef.current
            const peakCaps = peakCapsRef.current

            const centerY = height * 0.52
            const maxBarHeight = height * 0.36

            // Real-time acoustic stem decomposition: Bass, Vocals, Instruments
            const stemBreakdown = calculateStemEnergies(freqData)
            const stems = smoothedStemsRef.current
            const stemLerp = isAudioPlaying ? 0.28 : 0.08
            stems.bass = stems.bass * (1 - stemLerp) + stemBreakdown.bass * stemLerp
            stems.vocals = stems.vocals * (1 - stemLerp) + stemBreakdown.vocals * stemLerp
            stems.instruments = stems.instruments * (1 - stemLerp) + stemBreakdown.instruments * stemLerp
            stems.dominant = stemBreakdown.dominant

            const { bassRgb, vocalRgb, instrumentRgb } = getStemPaletteColors(currentTheme.palette)

            // Dynamic Song Section Ambient Aura: Shifts color to reflect active section of song
            if (isAudioPlaying) {
              const auraRadius = Math.max(width * 0.45, height * 0.55)
              const auraGrad = ctx.createRadialGradient(width * 0.5, centerY, 10, width * 0.5, centerY, auraRadius)
              
              let auraColor = bassRgb
              let auraAlpha = 0.12 + stems.bass * 0.15

              if (stems.dominant === 'vocals') {
                auraColor = vocalRgb
                auraAlpha = 0.14 + stems.vocals * 0.18
              } else if (stems.dominant === 'instruments') {
                auraColor = instrumentRgb
                auraAlpha = 0.11 + stems.instruments * 0.16
              } else if (stems.dominant === 'bass') {
                auraColor = bassRgb
                auraAlpha = 0.16 + stems.bass * 0.22
              }

              auraGrad.addColorStop(0, `rgba(${auraColor.r}, ${auraColor.g}, ${auraColor.b}, ${auraAlpha})`)
              auraGrad.addColorStop(0.5, `rgba(${auraColor.r}, ${auraColor.g}, ${auraColor.b}, ${auraAlpha * 0.35})`)
              auraGrad.addColorStop(1, 'rgba(0, 0, 0, 0)')
              ctx.fillStyle = auraGrad
              ctx.fillRect(0, 0, width, height)
            }

            // Draw Symmetrical Centered 2D Frequency Bars Filling 100% of Screen Width Edge-to-Edge
            // - Center bars: BASS section
            // - Mid bars: VOCALS section
            // - Outer bars: INSTRUMENTS section
            const barSpacing = Math.max(1.5, width * 0.002)
            const totalBars = Math.min(MAX_BARS, Math.max(64, Math.floor(width / (barSpacing + 7))))
            const barWidth = (width - barSpacing * (totalBars - 1)) / totalBars
            const startX = 0

            for (let i = 0; i < totalBars; i++) {
              // Map bars symmetrically: center has bass, outer sides have mids/treble
              const distFromCenter = Math.abs(i - (totalBars - 1) / 2) / ((totalBars - 1) / 2)
              const binIdx = Math.min(127, Math.floor(distFromCenter * 88))
              const rawVal = (freqData[binIdx] || 0) / 255

              // Dynamic acoustic impulse
              const baseResting = isAudioPlaying ? 0.08 : 0.0
              const targetHeight = isAudioPlaying
                ? Math.min(1.0, baseResting + rawVal * 0.92) * maxBarHeight
                : 0

              // Smooth 60fps lerp physics
              smoothedHeights[i] = smoothedHeights[i] * 0.68 + targetHeight * 0.32
              const barH = smoothedHeights[i]

              // Peak hold cap with gravity decay
              if (barH >= peakCaps[i]) {
                peakCaps[i] = barH
              } else {
                peakCaps[i] = Math.max(0, peakCaps[i] - 1.2)
              }

              const x = startX + i * (barWidth + barSpacing)
              const yTop = centerY - barH
              const halfH = barH
              const radius = Math.min(barWidth / 2, 2.5)

              // Precise section color for each frequency stem band
              const fillColor = getFrequencyHeatmapColor(distFromCenter, currentTheme.palette, 0.92)

              // Upward Bar
              ctx.fillStyle = fillColor
              ctx.beginPath()
              if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(x, yTop, barWidth, halfH, [radius, radius, 0, 0])
              } else {
                ctx.rect(x, yTop, barWidth, halfH)
              }
              ctx.fill()

              // Downward Soft Reflection
              const reflectionAlpha = currentTheme.hasArtwork ? 0.22 : 0.15
              ctx.fillStyle = getFrequencyHeatmapColor(distFromCenter, currentTheme.palette, reflectionAlpha)

              ctx.beginPath()
              if (typeof ctx.roundRect === 'function') {
                ctx.roundRect(x, centerY + 2, barWidth, halfH * 0.55, [0, 0, radius, radius])
              } else {
                ctx.rect(x, centerY + 2, barWidth, halfH * 0.55)
              }
              ctx.fill()

              // Floating Peak Cap
              const capY = centerY - peakCaps[i] - 3
              if (capY < centerY - 2) {
                ctx.fillStyle = getFrequencyHeatmapColor(distFromCenter, currentTheme.palette, 1.0)
                ctx.fillRect(x, capY, barWidth, 1.5)
              }
            }

            // Pure Physical Bass Isolation:
            // Isolate strictly true sub-bass and bass fundamental frequencies (0 - 180Hz) -> bins 0 and 1
            const rawBassEnergy = Math.max(0, ((freqData[0] || 0) * 0.8 + (freqData[1] || 0) * 0.2) / 255 - 0.04)

            // Smooth 60fps lerp physics strictly for bass response (fast attack, natural decay)
            const bass = smoothedBassRef.current
            bass.sub = bass.sub * 0.62 + rawBassEnergy * 0.38

            // Retrieve lowpass (<150Hz) filtered time-domain bass waveform
            const bassWave = frame.bassWaveformData || frame.waveformData
            const hasBassWave = Boolean(bassWave && bassWave.length > 0)

            // Draw Real-Time Center Bassline (Accurately Representing ONLY the Song's Bass)
            const bassPoints = 128
            const maxBassDisplacement = height * 0.25

            // Primary Glowing Bassline
            ctx.save()
            ctx.beginPath()
            ctx.lineWidth = Math.min(5.5, 2.0 + bass.sub * 4.0)
            ctx.shadowBlur = stems.dominant === 'bass' ? 20 : 10
            ctx.shadowColor = `rgba(${bassRgb.r}, ${bassRgb.g}, ${bassRgb.b}, ${0.4 + bass.sub * 0.5})`
            ctx.strokeStyle = `rgba(${bassRgb.r}, ${bassRgb.g}, ${bassRgb.b}, ${0.7 + bass.sub * 0.3})`

            for (let p = 0; p < bassPoints; p++) {
              const norm = p / (bassPoints - 1)
              const px = norm * width

              // Envelope anchors the line at 0 on screen edges and swells in the center
              const envelope = Math.sin(norm * Math.PI)

              // Direct physical bass excursion:
              // Samples the 150Hz low-pass filtered audio wave.
              // When only vocals/instruments play, rawSample is 0 and line remains calm.
              // When 808 / bass / kick hits, rawSample undulates with the exact acoustic bass wave.
              let displacement = 0

              if (isAudioPlaying && hasBassWave) {
                const waveIdx = Math.min(bassWave.length - 1, Math.floor(norm * (bassWave.length - 1)))
                const rawSample = ((bassWave[waveIdx] || 128) - 128) / 128
                displacement = rawSample * envelope * maxBassDisplacement * (0.35 + bass.sub * 0.85)
              }

              const py = centerY + displacement

              if (p === 0) {
                ctx.moveTo(px, py)
              } else {
                ctx.lineTo(px, py)
              }
            }
            ctx.stroke()

            // Subtle Harmonic Bass Reflection Wave (Only appears when bass is actively hitting)
            if (isAudioPlaying && bass.sub > 0.06 && hasBassWave) {
              ctx.beginPath()
              ctx.lineWidth = 1.2
              ctx.shadowBlur = 0
              ctx.strokeStyle = `rgba(${bassRgb.r}, ${bassRgb.g}, ${bassRgb.b}, ${0.15 + bass.sub * 0.25})`

              for (let p = 0; p < bassPoints; p++) {
                const norm = p / (bassPoints - 1)
                const px = norm * width
                const envelope = Math.sin(norm * Math.PI)
                const waveIdx = Math.min(bassWave.length - 1, Math.floor(norm * (bassWave.length - 1)))
                const rawSample = ((bassWave[waveIdx] || 128) - 128) / 128
                const displacement = -rawSample * envelope * maxBassDisplacement * 0.45 * bass.sub
                const py = centerY + displacement

                if (p === 0) {
                  ctx.moveTo(px, py)
                } else {
                  ctx.lineTo(px, py)
                }
              }
              ctx.stroke()
            }

            ctx.restore()

            ctx.restore()
          }
        }
      }
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => {
      cancelAnimationFrame(animId)
    }
  }, [])

  return (
    <div className={cn('relative w-full h-full overflow-hidden select-none', className)}>
      <canvas
        aria-hidden="true"
        ref={canvasRef}
        className="w-full h-full block pointer-events-none"
      />
    </div>
  )
}
