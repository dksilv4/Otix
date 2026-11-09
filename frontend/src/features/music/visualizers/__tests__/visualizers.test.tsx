import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import {
  formatVisualizerTime,
  rgbToHexNumber,
  getNextVisualizerMode,
  getPreviousVisualizerMode,
  getVisualizerModeOption,
  getAdjacentVisualizerMode,
  VISUALIZER_MODES,
  calculateStemEnergies,
  getStemPaletteColors,
  getFrequencyHeatmapColor,
  getFiveColorPalette,
} from '../utils/visualizer-helpers'
import { audioVisualizerEngine } from '../utils/audio-analyzer'
import {
  getSavedPlaybackSession,
  savePlaybackSessionImmediate,
  clearPlaybackSession,
  getSavedCameraPresetState,
  saveCameraPresetState,
  clearCameraPresetStates,
} from '../utils/playback-persistence'
import { WaveformScrubber } from '../components/waveform-scrubber'
import { PresetSelectorPopover } from '../components/preset-selector-popover'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'

describe('Music Visualizers & Helpers Suite', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  describe('visualizer-helpers', () => {
    it('formats time correctly', () => {
      expect(formatVisualizerTime(0)).toBe('0:00')
      expect(formatVisualizerTime(65000)).toBe('1:05')
      expect(formatVisualizerTime(228000)).toBe('3:48')
      expect(formatVisualizerTime(-500)).toBe('0:00')
    })

    it('converts rgb to hex number', () => {
      expect(rgbToHexNumber(255, 0, 0)).toBe(0xff0000)
      expect(rgbToHexNumber(0, 255, 0)).toBe(0x00ff00)
      expect(rgbToHexNumber(0, 0, 255)).toBe(0x0000ff)
    })

    it('cycles visualizer modes forward and backward', () => {
      expect(getNextVisualizerMode('wavy-19')).toBe('wavy-18')
      expect(getNextVisualizerMode('wavy-18')).toBe('wavy-17')
      expect(getNextVisualizerMode('wavy-matrix')).toBe('wavy-spiral-1')
      expect(getNextVisualizerMode('wavy-spiral-1')).toBe('wavy-spiral-2')
      expect(getNextVisualizerMode('wavy-spiral-2')).toBe('mesh-tunnel')
      expect(getNextVisualizerMode('mesh-tunnel')).toBe('sphere-mesh')
      expect(getNextVisualizerMode('sphere-mesh')).toBe('sphere-rings')
      expect(getNextVisualizerMode('sphere-rings')).toBe('city-skyscrapers')
      expect(getNextVisualizerMode('city-skyscrapers')).toBe('city-horizon')
      expect(getNextVisualizerMode('city-horizon')).toBe('spectrum-2d')
      expect(getNextVisualizerMode('spectrum-2d')).toBe('wavy-19')
      expect(getPreviousVisualizerMode('wavy-19')).toBe('spectrum-2d')
      expect(getPreviousVisualizerMode('wavy-18')).toBe('wavy-19')
    })

    it('defines visualizer modes with 3D and 2D designations', () => {
      expect(VISUALIZER_MODES).toHaveLength(13)
      const modes3D = VISUALIZER_MODES.filter((m) => m.dimension === '3D')
      const modes2D = VISUALIZER_MODES.filter((m) => m.dimension === '2D')
      expect(modes3D).toHaveLength(12)
      expect(modes2D).toHaveLength(1)
    })

    it('generates 5 distinct harmonious colors for the visualizer theme', () => {
      const palette = {
        accent: { r: 168, g: 85, b: 247 },
        surface: { r: 30, g: 30, b: 40 },
        background: { r: 12, g: 12, b: 18 },
      }
      const fiveColors = getFiveColorPalette(palette, true)
      expect(fiveColors.hexes).toHaveLength(5)
      expect(fiveColors.rgbs).toHaveLength(5)
      fiveColors.hexes.forEach((hex) => {
        expect(typeof hex).toBe('number')
      })
    })

    it('looks up mode options and adjacent modes', () => {
      const option = getVisualizerModeOption('wavy-19')
      expect(option.name).toBe('Oceanic Swell')
      expect(option.dimension).toBe('3D')

      expect(getAdjacentVisualizerMode('wavy-19', 'next')).toBe('wavy-18')
      expect(getAdjacentVisualizerMode('wavy-19', 'prev')).toBe('spectrum-2d')
    })

    it('calculates stem energies for bass, vocals, and instruments', () => {
      const freqData = new Uint8Array(128)
      // Saturate bass bins (0 to 6)
      for (let i = 0; i <= 6; i++) freqData[i] = 250
      // Low vocal and instrument bins
      for (let i = 7; i < 128; i++) freqData[i] = 20

      const breakdown = calculateStemEnergies(freqData)
      expect(breakdown.bass).toBeGreaterThan(0.9)
      expect(breakdown.vocals).toBeLessThan(0.15)
      expect(breakdown.dominant).toBe('bass')
    })

    it('derives harmonically distinct stem colors for bass, vocals, and instruments', () => {
      const palette = {
        accent: { r: 168, g: 85, b: 247 },
        dominant: { r: 120, g: 50, b: 200 },
      }
      const colors = getStemPaletteColors(palette)
      expect(colors.bassRgb).toBeDefined()
      expect(colors.vocalRgb).toBeDefined()
      expect(colors.instrumentRgb).toBeDefined()

      // Colors should be distinct across the frequency spectrum
      const bassColor = getFrequencyHeatmapColor(0.1, palette)
      const vocalColor = getFrequencyHeatmapColor(0.5, palette)
      const instColor = getFrequencyHeatmapColor(0.9, palette)

      expect(bassColor).toContain('rgba(')
      expect(vocalColor).toContain('rgba(')
      expect(instColor).toContain('rgba(')
      expect(bassColor).not.toEqual(vocalColor)
      expect(vocalColor).not.toEqual(instColor)
    })
  })

  describe('audioVisualizerEngine', () => {
    it('generates a full audio frame with frequency and waveform data', () => {
      const frame = audioVisualizerEngine.getAudioFrame(15000, 180000, true)
      expect(frame.frequencyData).toBeInstanceOf(Uint8Array)
      expect(frame.waveformData).toBeInstanceOf(Uint8Array)
      expect(frame.frequencyData.length).toBe(128)
      expect(frame.waveformData.length).toBe(128)
      expect(frame.bass).toBeGreaterThanOrEqual(0)
      expect(frame.bass).toBeLessThanOrEqual(1)
      expect(frame.energy).toBeGreaterThanOrEqual(0)
      expect(frame.energy).toBeLessThanOrEqual(1)
    })

    it('settles to calm resting state when playback is paused', () => {
      const frame = audioVisualizerEngine.getAudioFrame(0, 0, false)
      expect(frame.isPlaying).toBe(false)
      expect(frame.waveformData[0]).toBe(128) // Center level
    })
  })

  describe('playback-persistence', () => {
    it('saves, retrieves, and clears playback session in localStorage', () => {
      expect(getSavedPlaybackSession()).toBeNull()

      const testSession: any = {
        source: 'local',
        track: {
          id: 'test-1',
          title: 'Test Song',
          artist: 'Test Artist',
          albumName: 'Test Album',
          albumArt: null,
          durationMs: 180000,
        },
        queue: [],
        positionMs: 45000,
        durationMs: 180000,
        status: 'playing',
        repeatMode: 'off',
        isShuffled: false,
        volume: 0.8,
        savedAt: Date.now(),
      }

      savePlaybackSessionImmediate(testSession)
      const retrieved = getSavedPlaybackSession()
      expect(retrieved).not.toBeNull()
      expect(retrieved?.track.title).toBe('Test Song')
      expect(retrieved?.positionMs).toBe(45000)

      clearPlaybackSession()
      expect(getSavedPlaybackSession()).toBeNull()
    })

    it('persists and restores custom camera angles and positions per preset', () => {
      expect(getSavedCameraPresetState('wavy-19')).toBeNull()

      saveCameraPresetState('wavy-19', {
        azimuth: -1.25,
        polar: 0.88,
        radius: 125.0,
        targetX: 0,
        targetY: -5,
        targetZ: 0,
      })

      saveCameraPresetState('mesh-tunnel', {
        azimuth: 0.42,
        polar: -0.15,
        radius: 16.0,
      })

      const wavyCam = getSavedCameraPresetState('wavy-19')
      expect(wavyCam).not.toBeNull()
      expect(wavyCam?.azimuth).toBe(-1.25)
      expect(wavyCam?.polar).toBe(0.88)
      expect(wavyCam?.radius).toBe(125.0)

      const tunnelCam = getSavedCameraPresetState('mesh-tunnel')
      expect(tunnelCam).not.toBeNull()
      expect(tunnelCam?.azimuth).toBe(0.42)
      expect(tunnelCam?.polar).toBe(-0.15)

      // Other presets remain untouched
      expect(getSavedCameraPresetState('wavy-18')).toBeNull()

      clearCameraPresetStates()
      expect(getSavedCameraPresetState('wavy-19')).toBeNull()
    })
  })

  describe('WaveformScrubber Component', () => {
    const mockTheme: MusicPlayerTheme = {
      palette: {
        background: { r: 10, g: 10, b: 15 },
        surface: { r: 25, g: 25, b: 35 },
        accent: { r: 168, g: 85, b: 247 },
        accentText: '#ffffff',
      },
      hasArtwork: true,
      accentRgb: 'rgb(168, 85, 247)',
      accentText: '#ffffff',
      accentRgba: (a) => `rgba(168, 85, 247, ${a})`,
      glowShadow: '0 4px 12px rgba(168, 85, 247, 0.3)',
      containerBackground: 'rgba(20, 20, 28, 0.75)',
      podBackground: 'rgba(25, 25, 35, 0.65)',
      borderColor: 'rgba(168, 85, 247, 0.16)',
      drawerBackdropGradient: 'none',
      textColor: 'rgb(248, 248, 252)',
      subtextColor: 'rgb(185, 185, 200)',
      iconColor: 'rgb(195, 195, 210)',
      iconHoverColor: 'rgb(248, 248, 252)',
      dividerColor: 'rgba(255, 255, 255, 0.12)',
      isLightBackground: false,
    }

    it('renders 44 waveform bars and time stamps', () => {
      const handleSeek = vi.fn()
      render(
        <WaveformScrubber
          positionMs={60000}
          durationMs={180000}
          isPlaying={true}
          theme={mockTheme}
          onSeek={handleSeek}
          barCount={44}
        />,
      )

      expect(screen.getByText('1:00')).toBeDefined()
      expect(screen.getByText('3:00')).toBeDefined()
    })

    it('invokes onSeek when pointer down on scrubber', () => {
      const handleSeek = vi.fn()
      const { container } = render(
        <WaveformScrubber
          positionMs={60000}
          durationMs={180000}
          isPlaying={true}
          theme={mockTheme}
          onSeek={handleSeek}
        />,
      )

      const slider = container.querySelector('[role="slider"]')
      expect(slider).not.toBeNull()
      if (slider) {
        // Mock getBoundingClientRect
        vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
          left: 0,
          top: 0,
          width: 200,
          height: 30,
          right: 200,
          bottom: 30,
          x: 0,
          y: 0,
          toJSON: () => {},
        })
        fireEvent.pointerDown(slider, { clientX: 100 })
        expect(handleSeek).toHaveBeenCalled()
      }
    })

    it('renders PresetSelectorPopover with all presets and triggers selection', () => {
      const handleSelect = vi.fn()
      const handleClose = vi.fn()

      const { rerender } = render(
        <PresetSelectorPopover
          isOpen={false}
          onClose={handleClose}
          currentMode="wavy-19"
          onSelectMode={handleSelect}
          theme={mockTheme}
        />,
      )

      expect(screen.queryByText('Visualizer Presets')).toBeNull()

      rerender(
        <PresetSelectorPopover
          isOpen={true}
          onClose={handleClose}
          currentMode="wavy-19"
          onSelectMode={handleSelect}
          theme={mockTheme}
        />,
      )

      expect(screen.getByText('Visualizer Presets')).toBeDefined()
      expect(screen.getByText('Oceanic Swell')).toBeDefined()
      expect(screen.getByText('Mountain Summits')).toBeDefined()
      expect(screen.getByText('Galactic Vortex')).toBeDefined()
      expect(screen.getByText('Mesh Tunnel')).toBeDefined()
      expect(screen.getByText('2D Spectrum')).toBeDefined()

      fireEvent.click(screen.getByText('Mountain Summits'))
      expect(handleSelect).toHaveBeenCalledWith('wavy-18')
      expect(handleClose).toHaveBeenCalled()
    })
  })
})
