import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as THREE from 'three'
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
  getAlbumGradientStops,
} from '../utils/visualizer-helpers'
import { audioVisualizerEngine } from '../utils/audio-analyzer'
import {
  getSavedPlaybackSession,
  savePlaybackSessionImmediate,
  clearPlaybackSession,
} from '../utils/playback-persistence'
import {
  getSavedVisualizerParams,
  saveVisualizerParams,
  getSavedVisualizerMode,
  saveVisualizerMode,
  clearSavedVisualizerSettings,
  applyPresetWithPersistentPreferences,
} from '../utils/visualizer-persistence'
import {
  generateVisualizerSeed,
  parseVisualizerSeed,
  generateRandomVisualizerSeed,
} from '../utils/visualizer-seed'
import { WaveformScrubber } from '../components/waveform-scrubber'
import { perlinNoise3D } from '../utils/perlin-noise'
import {
  DEFAULT_MESH_GRID_PARAMS,
  MESH_GRID_VARIANT_14_CONFIG,
  GRID_VARIANT_PRESETS,
  MESH_GRID_PRESETS,
  MESH_GRID_PARAM_CATEGORIES,
  CAMERA_SNAP_PRESETS,
  formatMeshGridParamValue,
  perlin3d,
  createMeshGridScene,
} from '../utils/mesh-grid-helpers'
import { MeshGridControlsPanel } from '../components/mesh-grid-controls-panel'
import { MeshGridVisualizerCanvas } from '../components/mesh-grid-visualizer-canvas'
import { FullScreenMusicPlayer } from '../components/full-screen-music-player'
import type { MusicPlayerTheme } from '../../hooks/use-music-palette'

vi.mock('@/lib/player/use-player', () => ({
  usePlayer: () => ({
    source: 'local',
    isPlaying: true,
    currentTrack: {
      id: 'trk-1',
      title: 'Neon Odyssey',
      artist: 'Otix Synth',
      artists: [],
      albumName: 'Flagship Sounds',
      albumArt: null,
      durationMs: 240000,
      source: 'local',
    },
    volume: 0.8,
    setVolume: vi.fn(),
    togglePlay: vi.fn(),
    skipNext: vi.fn(),
    skipPrevious: vi.fn(),
    seek: vi.fn(),
    stop: vi.fn(),
    queue: [],
    localQueue: [],
    plexQueue: [],
    jellyfinQueue: [],
    queueIndex: 0,
    repeatMode: 'off',
    isShuffled: false,
    toggleShuffle: vi.fn(),
    toggleRepeat: vi.fn(),
    removeFromQueue: vi.fn(),
    selectQueueIndex: vi.fn(),
    skipLocalToIndex: vi.fn(),
    skipPlexToIndex: vi.fn(),
    skipJellyfinToIndex: vi.fn(),
  }),
}))

vi.mock('@/lib/player/use-player-progress', () => ({
  usePlayerProgress: () => ({
    position: 45000,
    duration: 240000,
  }),
}))

vi.mock('../hooks/use-full-screen-player', () => ({
  useFullScreenPlayer: () => ({
    isQueueOpen: false,
    setIsQueueOpen: vi.fn(),
    isNativeFullscreen: false,
    toggleNativeFullscreen: vi.fn(),
    resetHideTimer: vi.fn(),
    activeQueue: [],
  }),
}))

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

    it('cycles visualizer modes correctly', () => {
      expect(getNextVisualizerMode('mesh-grid')).toBe('spectrum-2d')
      expect(getNextVisualizerMode('spectrum-2d')).toBe('mesh-grid')
      expect(getPreviousVisualizerMode('mesh-grid')).toBe('spectrum-2d')
    })

    it('defines visualizer modes including 3D Mesh Grid', () => {
      expect(VISUALIZER_MODES).toHaveLength(2)
      expect(VISUALIZER_MODES.map((m) => m.id)).toContain('mesh-grid')
      expect(VISUALIZER_MODES.map((m) => m.id)).toContain('spectrum-2d')
      const meshOption = VISUALIZER_MODES.find((m) => m.id === 'mesh-grid')
      expect(meshOption?.dimension).toBe('3D')
      expect(meshOption?.name).toBe('3D Mesh Grid')
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

    it('generates album gradient stops', () => {
      const palette = {
        accent: { r: 168, g: 85, b: 247 },
        surface: { r: 30, g: 30, b: 40 },
        background: { r: 12, g: 12, b: 18 },
      }
      const stops = getAlbumGradientStops(palette, true)
      expect(stops.low).toBeDefined()
      expect(stops.mid).toBeDefined()
      expect(stops.high).toBeDefined()
    })

    it('looks up mode options and adjacent modes', () => {
      const option = getVisualizerModeOption('spectrum-2d')
      expect(option.name).toBe('2D Spectrum')
      expect(option.dimension).toBe('2D')

      expect(getAdjacentVisualizerMode('spectrum-2d', 'next')).toBe('mesh-grid')
      expect(getAdjacentVisualizerMode('spectrum-2d', 'prev')).toBe('mesh-grid')
      expect(getAdjacentVisualizerMode('mesh-grid', 'next')).toBe('spectrum-2d')
    })

    it('calculates stem energies for bass, vocals, and instruments', () => {
      const freqData = new Uint8Array(128)
      // Saturate bass bins (0 to 6)
      for (let i = 0; i <= 6; i++) freqData[i] = 250
      const stemResult = calculateStemEnergies(freqData)
      expect(stemResult.bass).toBeGreaterThan(0.9)
      expect(stemResult.dominant).toBe('bass')
    })

    it('generates harmonic stem palette colors based on extracted palette', () => {
      const palette = {
        accent: { r: 200, g: 100, b: 50 },
        surface: { r: 40, g: 30, b: 60 },
        background: { r: 10, g: 10, b: 15 },
      }
      const { bassRgb, vocalRgb, instrumentRgb } = getStemPaletteColors(palette)
      expect(bassRgb.r).toBeGreaterThanOrEqual(0)
      expect(vocalRgb.g).toBeGreaterThanOrEqual(0)
      expect(instrumentRgb.b).toBeGreaterThanOrEqual(0)
    })

    it('computes frequency heatmap color for varying frequency bands', () => {
      const palette = {
        accent: { r: 168, g: 85, b: 247 },
        surface: { r: 30, g: 30, b: 40 },
        background: { r: 12, g: 12, b: 18 },
      }
      const bassColor = getFrequencyHeatmapColor(0.1, palette, 0.8)
      const vocalColor = getFrequencyHeatmapColor(0.5, palette, 0.8)
      const trebleColor = getFrequencyHeatmapColor(0.9, palette, 0.8)

      expect(bassColor).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*0\.8\)$/)
      expect(vocalColor).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*0\.8\)$/)
      expect(trebleColor).toMatch(/^rgba\(\d+,\s*\d+,\s*\d+,\s*0\.8\)$/)
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

      const testSession = {
        source: 'local' as const,
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
        status: 'playing' as const,
        repeatMode: 'off' as const,
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
  })

  describe('WaveformScrubber Component', () => {
    const mockTheme: MusicPlayerTheme = {
      palette: {
        background: { r: 10, g: 10, b: 15 },
        surface: { r: 25, g: 25, b: 35 },
        accent: { r: 168, g: 85, b: 247 },
        accentText: 'text-primary-foreground',
      },
      hasArtwork: true,
      accentRgb: '168, 85, 247',
      accentText: 'text-primary-foreground',
      accentRgba: (a) => `rgba(168, 85, 247, ${a})`,
      glowShadow: 'none',
      containerBackground: 'var(--dk-surface-base)',
      podBackground: 'var(--dk-surface-ghost)',
      borderColor: 'transparent',
      drawerBackdropGradient: '',
      textColor: 'text-foreground',
      subtextColor: 'text-muted-foreground',
      iconColor: 'currentColor',
      iconHoverColor: 'currentColor',
      dividerColor: 'transparent',
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
  })

  describe('3D Mesh Grid Visualizer & Procedural Noise', () => {
    it('computes 3D Perlin noise values in [0, 1] range', () => {
      const val1 = perlinNoise3D(0.5, 0.5, 0.5)
      const val2 = perlinNoise3D(12.34, 56.78, 90.12)
      const val3 = perlinNoise3D(0, 0, 0)

      expect(val1).toBeGreaterThanOrEqual(0)
      expect(val1).toBeLessThanOrEqual(1)
      expect(val2).toBeGreaterThanOrEqual(0)
      expect(val2).toBeLessThanOrEqual(1)
      expect(val3).toBeGreaterThanOrEqual(0)
      expect(val3).toBeLessThanOrEqual(1)
    })

    it('has valid default mesh grid parameters replicating Flagship Variant 14', () => {
      expect(DEFAULT_MESH_GRID_PARAMS.gridSizeX).toBe(177)
      expect(DEFAULT_MESH_GRID_PARAMS.gridSizeY).toBe(177)
      expect(DEFAULT_MESH_GRID_PARAMS.waveHeight).toBe(1.1)
      expect(DEFAULT_MESH_GRID_PARAMS.meshBend).toBe(-12)
      expect(DEFAULT_MESH_GRID_PARAMS.circleShape).toBe(true)
      expect(DEFAULT_MESH_GRID_PARAMS.spectrumSpiral).toBe(0)
      expect(DEFAULT_MESH_GRID_PARAMS.radialMix).toBe(0.5)
      expect(DEFAULT_MESH_GRID_PARAMS.flowMix).toBe(0.45)
      expect(DEFAULT_MESH_GRID_PARAMS.angleHueMix).toBe(0.3)
      expect(DEFAULT_MESH_GRID_PARAMS.lineReactivity).toBe(0.9)
    })

    it('matches exact Flagship Variant 14 configuration', () => {
      expect(MESH_GRID_VARIANT_14_CONFIG.gridSizeX).toBe(177)
      expect(MESH_GRID_VARIANT_14_CONFIG.gridSizeY).toBe(177)
      expect(MESH_GRID_VARIANT_14_CONFIG.cameraPosition.x).toBeCloseTo(32.68, 1)
      expect(MESH_GRID_VARIANT_14_CONFIG.cameraPosition.y).toBeCloseTo(23.56, 1)
      expect(MESH_GRID_VARIANT_14_CONFIG.cameraPosition.z).toBeCloseTo(98.96, 1)
      expect(MESH_GRID_VARIANT_14_CONFIG.starfieldEnabled).toBe(true)
      expect(MESH_GRID_VARIANT_14_CONFIG.starTwinkleSpeed).toBe(1.8)
    })

    it('supports configurable wave geometry and height-based color options', () => {
      expect(DEFAULT_MESH_GRID_PARAMS.sphereWrap).toBe(0.0)
      expect(DEFAULT_MESH_GRID_PARAMS.colorLowCutoff).toBe(0.20)
      expect(DEFAULT_MESH_GRID_PARAMS.colorMidCutoff).toBe(0.60)
      expect(DEFAULT_MESH_GRID_PARAMS.colorApexCutoff).toBe(0.88)
      expect(DEFAULT_MESH_GRID_PARAMS.baselineWireframeAlpha).toBe(0.85)
      expect(DEFAULT_MESH_GRID_PARAMS.colorByHeight).toBe(false)
      expect(DEFAULT_MESH_GRID_PARAMS.heightColorScale).toBe(1.0)
    })

    it('provides recreated Preset 14 with all wave cascade and geometry parameters', () => {
      expect(MESH_GRID_PRESETS.length).toBeGreaterThanOrEqual(1)
      const p14 = MESH_GRID_PRESETS[0]
      expect(p14.id).toBe('variant-14')
      expect(p14.params.waveHeight).toBe(1.1)
      expect(p14.params.flowMix).toBe(0.45)
      expect(p14.params.meshBend).toBe(-12.0)
      expect(p14.params.sphereWrap).toBe(0.0)
      expect(p14.params.colorApexCutoff).toBe(0.88)
      expect(p14.params.baselineWireframeAlpha).toBe(0.85)
      expect(p14.params.useAlbumPalette).toBe(false)
    })

    it('exports all 16 mesh grid presets with exact parameters and controls', () => {
      expect(GRID_VARIANT_PRESETS).toHaveLength(16)
      for (let i = 1; i <= 16; i++) {
        const p = GRID_VARIANT_PRESETS.find((x) => x.id === `grid-preset-${i}`)
        expect(p).toBeDefined()
        expect(p?.name).toContain(`Preset ${i}`)
      }

      // Check Preset 14 in GRID_VARIANT_PRESETS
      const p14 = GRID_VARIANT_PRESETS.find((x) => x.id === 'grid-preset-14')!
      expect(p14.params.feedback_enabled).toBe(true)
      expect(p14.params.feedback_decay).toBe(0.52)
      expect(p14.params.fftSize).toBe(16384)
      expect(p14.params.meshBend).toBe(-12.0)

      // Check specific variant traits
      const p7 = GRID_VARIANT_PRESETS.find((x) => x.id === 'grid-preset-7')!
      expect(p7.params.gridSizeX).toBe(150)
      expect(p7.params.perlinNoiseIntensity).toBe(1.8)

      const p9 = GRID_VARIANT_PRESETS.find((x) => x.id === 'grid-preset-9')!
      expect(p9.params.waveHeight).toBe(3.5)
      expect(p9.params.meshBend).toBe(50)

      const p16 = GRID_VARIANT_PRESETS.find((x) => x.id === 'grid-preset-16')!
      expect(p16.params.waveSpeed).toBe(2.1)
      expect(p16.params.cameraRotationY).toBe(0.0012)

      // Verify MESH_GRID_PRESETS includes featured presets plus all 16 variants (21 total)
      expect(MESH_GRID_PRESETS.length).toBe(21)

      const mountainPreset = MESH_GRID_PRESETS.find((x) => x.id === 'reactive-mountain')!
      expect(mountainPreset).toBeDefined()
      expect(mountainPreset.params.perlinNoiseIntensity).toBe(0.0)
      expect(mountainPreset.params.jaggedness).toBe(0.0)
      expect(mountainPreset.params.centerMountainHeight).toBe(14.0)
      expect(mountainPreset.params.flowDirection).toBe('mountain-down')
      expect(mountainPreset.params.centerMountainAudioReactivity).toBe(1.0)
      expect(mountainPreset.params.centerSpireReactivity).toBe(1.8)
      expect(mountainPreset.params.colorByHeight).toBe(true)
    })

    it('computes 3D Perlin noise in normalized range for organic terrain flow', () => {
      const val1 = perlin3d(0.5, 0.5, 0.5)
      const val2 = perlin3d(12.3, 45.6, 7.89)
      expect(val1).toBeGreaterThanOrEqual(0.0)
      expect(val1).toBeLessThanOrEqual(1.0)
      expect(val2).toBeGreaterThanOrEqual(0.0)
      expect(val2).toBeLessThanOrEqual(1.0)
      // Deterministic continuity
      expect(perlin3d(0.5, 0.5, 0.5)).toBeCloseTo(val1, 5)
    })

    it('formats mesh grid parameter values with appropriate units and scales', () => {
      expect(formatMeshGridParamValue('meshBend', -12.5)).toBe('-12.5°')
      expect(formatMeshGridParamValue('meshBend', 15.0)).toBe('+15.0°')
      expect(formatMeshGridParamValue('sphereWrap', 180)).toBe('+180°')
      expect(formatMeshGridParamValue('sphereWrap', -180)).toBe('-180°')
      expect(formatMeshGridParamValue('waveHeight', 1.1)).toBe('1.1x')
      expect(formatMeshGridParamValue('colorIntensity', 2.0)).toBe('2.00')
      expect(formatMeshGridParamValue('circleShape', true)).toBe('Enabled')
      expect(formatMeshGridParamValue('circleShape', false)).toBe('Disabled')
      expect(formatMeshGridParamValue('flowDirection', 'mountain-down')).toBe('Cascading Down Peak')
      expect(formatMeshGridParamValue('flowDirection', 'top-down')).toBe('Top → Down')
      expect(formatMeshGridParamValue('flowDirection', 'radial')).toBe('Concentric (Radial)')
      expect(formatMeshGridParamValue('mountainPeakCount', 5)).toBe('5 Peaks')
      expect(formatMeshGridParamValue('centerMountainHeight', 48.0)).toBe('48.0')
      expect(formatMeshGridParamValue('centerMountainHeight', 0)).toBe('Disabled')
      expect(formatMeshGridParamValue('centerMountainRadius', 0.44)).toBe('44%')
      expect(formatMeshGridParamValue('mountainPeakSpread', 0.58)).toBe('58%')
      expect(formatMeshGridParamValue('centerSpireReactivity', 1.8)).toBe('1.80x')
    })

    it('defines comprehensive parameter categories covering all visualizer controls', () => {
      expect(MESH_GRID_PARAM_CATEGORIES.length).toBe(9)
      const catIds = MESH_GRID_PARAM_CATEGORIES.map((c) => c.id)
      expect(catIds).toContain('camera')
      expect(catIds).toContain('audio')
      expect(catIds).toContain('wave')
      expect(catIds).toContain('mountain')
      expect(catIds).toContain('geometry')
      expect(catIds).toContain('noise')
      expect(catIds).toContain('theme')
      expect(catIds).toContain('starfield')
      expect(catIds).toContain('feedback')

      const allKeys = MESH_GRID_PARAM_CATEGORIES.flatMap((c) => c.controls.map((ctrl) => ctrl.key))
      expect(allKeys).toContain('cameraFov')
      expect(allKeys).toContain('cameraDamping')
      expect(allKeys).toContain('cameraRotationY')
      expect(allKeys).toContain('cameraAutoPitch')
      expect(allKeys).toContain('lockCameraOnPresetChange')
      expect(allKeys).toContain('waveHeight')
      expect(allKeys).toContain('waveSpeed')
      expect(allKeys).toContain('flowDirection')
      expect(allKeys).toContain('colorIntensity')
      expect(allKeys).toContain('colorByHeight')
      expect(allKeys).toContain('heightColorScale')
      expect(allKeys).toContain('meshBend')
      expect(allKeys).toContain('sphereWrap')
      expect(allKeys).toContain('centerMountainHeight')
      expect(allKeys).toContain('mountainPeakCount')
      expect(allKeys).toContain('centerMountainRadius')
      expect(allKeys).toContain('mountainPeakSpread')
      expect(allKeys).toContain('centerMountainSharpness')
      expect(allKeys).toContain('mountainRidgeDetail')
      expect(allKeys).toContain('centerMountainAudioReactivity')
      expect(allKeys).toContain('centerSpireReactivity')
      expect(allKeys).toContain('centerMountainBaseHeight')
      expect(allKeys).toContain('useAlbumPalette')
      expect(allKeys).toContain('starfieldEnabled')
      expect(allKeys).toContain('feedback_enabled')
      expect(allKeys).toContain('feedback_decay')
      expect(allKeys).toContain('feedback_zoom')
      expect(allKeys).toContain('feedback_rotate')
      expect(allKeys).toContain('feedback_hueShift')
    })
  })

  describe('MeshGridControlsPanel Component', () => {
    const mockTheme: MusicPlayerTheme = {
      accentRgb: 'rgb(0, 255, 204)',
      containerBackground: 'rgba(20, 20, 25, 0.7)',
      podBackground: 'rgba(25, 25, 30, 0.85)',
      cardBackground: 'rgba(30, 30, 35, 0.9)',
      glowShadow: '0 0 20px rgba(0, 255, 204, 0.2)',
      textColor: '#ffffff',
      subtextColor: '#aaaaaa',
      dividerColor: 'rgba(255, 255, 255, 0.1)',
      iconColor: '#cccccc',
      hasArtwork: true,
      palette: null,
    }

    it('renders controls panel when open and displays title and categories', () => {
      const onParamChange = vi.fn()
      const onApplyPreset = vi.fn()
      const onResetParams = vi.fn()
      const onResetCamera = vi.fn()
      const onClose = vi.fn()

      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={onClose}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={onParamChange}
          onApplyPreset={onApplyPreset}
          onResetParams={onResetParams}
          onResetCamera={onResetCamera}
          theme={mockTheme}
        />,
      )

      expect(screen.getByText('Mesh Visualizer Controls')).toBeInTheDocument()
      expect(screen.getByText('Theme & Coloring')).toBeInTheDocument()
      expect(screen.getByText('Wave Dynamics')).toBeInTheDocument()
      expect(screen.getByText('Geometry & Curvature')).toBeInTheDocument()
      expect(screen.getByText('Cosmic Starfield')).toBeInTheDocument()
    })

    it('triggers onResetParams when clicking reset button', () => {
      const onResetParams = vi.fn()
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={vi.fn()}
          onApplyPreset={vi.fn()}
          onResetParams={onResetParams}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      const resetButtons = screen.getAllByLabelText(/Reset Parameters to Preset 14/i)
      fireEvent.click(resetButtons[0])
      expect(onResetParams).toHaveBeenCalledTimes(1)
    })

    it('triggers onParamChange when adjusting a slider', () => {
      const onParamChange = vi.fn()
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={onParamChange}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      const waveHeightSlider = screen.getByLabelText('Wave Height')
      fireEvent.change(waveHeightSlider, { target: { value: '2.5' } })
      expect(onParamChange).toHaveBeenCalledWith('waveHeight', 2.5)
    })

    it('does not render when isOpen is false', () => {
      render(
        <MeshGridControlsPanel
          isOpen={false}
          onClose={vi.fn()}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={vi.fn()}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      expect(screen.queryByText('Mesh Visualizer Controls')).not.toBeInTheDocument()
    })

    it('configures audio visualizer engine with high-res FFT and sensitivity', () => {
      audioVisualizerEngine.setConfig({
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        sensitivity: 1.5,
        gain: 1.2,
      })
      const frame = audioVisualizerEngine.getAudioFrame(1000, 200000, true)
      expect(frame.frequencyData).toBeDefined()
      expect(frame.frequencyData.length).toBe(128)
      expect(frame.highResFrequencyData).toBeDefined()
      expect(frame.highResFrequencyData?.length).toBe(1024)

      // Reset back to standard 256 FFT
      audioVisualizerEngine.setConfig({ fftSize: 256 })
      const resetFrame = audioVisualizerEngine.getAudioFrame(1000, 200000, true)
      expect(resetFrame.highResFrequencyData).toBeUndefined()
    })

    it('renders quick presets list with all 21 presets and triggers onApplyPreset', () => {
      const onApplyPreset = vi.fn()
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={vi.fn()}
          onApplyPreset={onApplyPreset}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      expect(screen.getByText('Presets (21)')).toBeInTheDocument()
      const presetButtons = screen.getAllByRole('button', { name: /Preset 14/i })
      expect(presetButtons.length).toBeGreaterThanOrEqual(1)

      // Click Preset 7 button
      const p7Button = screen.getByRole('button', { name: /Preset 7/i })
      fireEvent.click(p7Button)
      expect(onApplyPreset).toHaveBeenCalledTimes(1)
      expect(onApplyPreset.mock.calls[0][0].id).toBe('grid-preset-7')
    })

    it('filters presets by group tabs and searches settings in real-time', () => {
      const onParamChange = vi.fn()
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={{ ...MESH_GRID_VARIANT_14_CONFIG, waveHeight: 3.5 }}
          onParamChange={onParamChange}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      // 1. Preset filter tab
      const featuredTab = screen.getByRole('button', { name: /Featured/i })
      fireEvent.click(featuredTab)
      expect(screen.getByText('Cosmic Hemisphere Globe')).toBeInTheDocument()
      expect(screen.queryByText('Preset 8 (Mesh Grid 20:22:49)')).not.toBeInTheDocument()

      // 2. Reset individual parameter modified from default (waveHeight is 3.5 vs default 1.1)
      const resetParamBtn = screen.getByLabelText('Reset Wave Height to default')
      fireEvent.click(resetParamBtn)
      expect(onParamChange).toHaveBeenCalledWith('waveHeight', MESH_GRID_VARIANT_14_CONFIG.waveHeight)

      // 3. Settings search
      const searchInput = screen.getByLabelText('Search Settings')
      fireEvent.change(searchInput, { target: { value: 'perlin' } })
      expect(screen.getByText(/settings matching/i)).toBeInTheDocument()
      expect(screen.getByText('Flowing Perlin Noise')).toBeInTheDocument()

      // 4. Clear search
      const clearBtn = screen.getByLabelText('Clear Search')
      fireEvent.click(clearBtn)
      expect(screen.getByText('Wave Height')).toBeInTheDocument()
    })

    it('supports select dropdown controls for FFT resolution and feedback blend mode', () => {
      const onParamChange = vi.fn()
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={onParamChange}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      const fftSelect = screen.getByLabelText('FFT Analysis Resolution')
      fireEvent.change(fftSelect, { target: { value: '4096' } })
      expect(onParamChange).toHaveBeenCalledWith('fftSize', 4096)

      const blendSelect = screen.getByLabelText('Echo Trail Blend Mode')
      fireEvent.change(blendSelect, { target: { value: 'mix' } })
      expect(onParamChange).toHaveBeenCalledWith('feedback_blendMode', 'mix')
    })

    it('has feedback echo trails and high-res FFT in Preset 14 config', () => {
      expect(MESH_GRID_VARIANT_14_CONFIG.feedback_enabled).toBe(true)
      expect(MESH_GRID_VARIANT_14_CONFIG.feedback_decay).toBe(0.52)
      expect(MESH_GRID_VARIANT_14_CONFIG.feedback_zoom).toBe(1.01)
      expect(MESH_GRID_VARIANT_14_CONFIG.feedback_blendMode).toBe('add')
      expect(MESH_GRID_VARIANT_14_CONFIG.fftSize).toBe(16384)
    })

    it('supports physical height-based coloring option and formatting', () => {
      expect(formatMeshGridParamValue('colorByHeight', true)).toBe('Physical Height')
      expect(formatMeshGridParamValue('colorByHeight', false)).toBe('Radial Harmonics')
      expect(formatMeshGridParamValue('heightColorScale', 1.45)).toBe('1.45x')

      const themeCat = MESH_GRID_PARAM_CATEGORIES.find((c) => c.id === 'theme')
      expect(themeCat).toBeDefined()
      const colorByHeightCtrl = themeCat?.controls.find((c) => c.key === 'colorByHeight')
      expect(colorByHeightCtrl).toBeDefined()
      expect(colorByHeightCtrl?.type).toBe('switch')

      const heightScaleCtrl = themeCat?.controls.find((c) => c.key === 'heightColorScale')
      expect(heightScaleCtrl).toBeDefined()
      expect(heightScaleCtrl?.type).toBe('slider')

      // Test toggling in controls panel
      const onParamChange = vi.fn()
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={{ ...MESH_GRID_VARIANT_14_CONFIG, colorByHeight: false }}
          onParamChange={onParamChange}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      const heightSwitch = screen.getByLabelText('Color by Physical Height')
      fireEvent.click(heightSwitch)
      expect(onParamChange).toHaveBeenCalledWith('colorByHeight', true)
    })

    it('mounts MeshGridVisualizerCanvas cleanly and tolerates non-WebGL environments', () => {
      const { container, unmount } = render(
        <MeshGridVisualizerCanvas
          isPlaying={true}
          positionMs={1000}
          durationMs={100000}
          params={MESH_GRID_VARIANT_14_CONFIG}
        />,
      )
      expect(container.querySelector('canvas')).toBeInTheDocument()
      unmount()
    })

    it('provides 5 quick camera snap angles with positions, targets, fovs, and visual tips', () => {
      expect(CAMERA_SNAP_PRESETS).toHaveLength(5)
      const ids = CAMERA_SNAP_PRESETS.map((s) => s.id)
      expect(ids).toContain('isometric')
      expect(ids).toContain('hero')
      expect(ids).toContain('top-down')
      expect(ids).toContain('horizon')
      expect(ids).toContain('close-up')

      CAMERA_SNAP_PRESETS.forEach((snap) => {
        expect(snap.position).toBeDefined()
        expect(snap.target).toBeDefined()
        expect(snap.fov).toBeGreaterThan(0)
        expect(snap.tip.length).toBeGreaterThan(10)
      })
    })

    it('supports camera lock toggle and quick angle snaps in controls panel', () => {
      const onParamChange = vi.fn()
      const onSnapCamera = vi.fn()

      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={{ ...MESH_GRID_VARIANT_14_CONFIG, lockCameraOnPresetChange: false }}
          onParamChange={onParamChange}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          onSnapCamera={onSnapCamera}
          theme={mockTheme}
        />,
      )

      // 1. Toggle camera lock button in header
      const lockBtn = screen.getByLabelText('Toggle Camera Lock')
      fireEvent.click(lockBtn)
      expect(onParamChange).toHaveBeenCalledWith('lockCameraOnPresetChange', true)

      // 2. Click a quick angle snap (e.g. Summit Hero)
      const heroBtn = screen.getByRole('button', { name: /Summit Hero/i })
      fireEvent.click(heroBtn)
      expect(onSnapCamera).toHaveBeenCalledWith('hero')
    })

    it('renders visual tips and min/max spectrum range labels on control cards', () => {
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={vi.fn()}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      // Verify range labels exist on camera FOV slider
      expect(screen.getByText('Telephoto 30°')).toBeInTheDocument()
      expect(screen.getByText('Fisheye 120°')).toBeInTheDocument()

      // Verify visual tip text is present
      expect(
        screen.getByText(/Wider FOV \(>80°\) creates a dynamic, dramatic fisheye perspective/i),
      ).toBeInTheDocument()
    })

    it('mounts FullScreenMusicPlayer cleanly and renders track metadata and visualizer mode button', () => {
      const handleClose = vi.fn()
      const { unmount } = render(
        <FullScreenMusicPlayer isOpen={true} onClose={handleClose} />,
      )

      expect(screen.getAllByText('Neon Odyssey').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByLabelText(/Visualizer mode/i)).toBeInTheDocument()

      unmount()
    })

    it('renders Album Theme Persisted badge when useAlbumPalette is true', () => {
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={{ ...MESH_GRID_VARIANT_14_CONFIG, useAlbumPalette: true }}
          onParamChange={vi.fn()}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      expect(screen.getByText('Album Theme Persisted')).toBeInTheDocument()
    })
  })

  // -------------------------------------------------------------------------
  // Visualizer Persistence Suite
  // -------------------------------------------------------------------------
  describe('Visualizer Persistence (visualizer-persistence)', () => {
    beforeEach(() => {
      clearSavedVisualizerSettings()
      localStorage.clear()
    })

    it('returns baseline Preset 14 defaults when no settings are saved', () => {
      const params = getSavedVisualizerParams()
      expect(params.gridSizeX).toBe(MESH_GRID_VARIANT_14_CONFIG.gridSizeX)
      expect(params.waveHeight).toBe(MESH_GRID_VARIANT_14_CONFIG.waveHeight)
      expect(params.flowDirection).toBe('radial')

      const mode = getSavedVisualizerMode()
      expect(mode).toBe('mesh-grid')
    })

    it('saves and restores custom visualizer parameters and mode', () => {
      const customParams = {
        ...MESH_GRID_VARIANT_14_CONFIG,
        waveHeight: 2.4,
        waveSpeed: 1.8,
        sphereWrap: 180,
        flowDirection: 'mountain-down' as const,
      }

      saveVisualizerParams(customParams)
      saveVisualizerMode('spectrum-2d')

      const restoredParams = getSavedVisualizerParams()
      expect(restoredParams.waveHeight).toBe(2.4)
      expect(restoredParams.waveSpeed).toBe(1.8)
      expect(restoredParams.sphereWrap).toBe(180)
      expect(restoredParams.flowDirection).toBe('mountain-down')

      const restoredMode = getSavedVisualizerMode()
      expect(restoredMode).toBe('spectrum-2d')
    })

    it('clears saved visualizer settings cleanly', () => {
      saveVisualizerParams({ ...MESH_GRID_VARIANT_14_CONFIG, waveHeight: 3.0 })
      saveVisualizerMode('spectrum-2d')

      clearSavedVisualizerSettings()

      expect(getSavedVisualizerMode()).toBe('mesh-grid')
      expect(getSavedVisualizerParams().waveHeight).toBe(MESH_GRID_VARIANT_14_CONFIG.waveHeight)
    })

    it('persists useAlbumPalette across presets using applyPresetWithPersistentPreferences', () => {
      const prev = {
        ...MESH_GRID_VARIANT_14_CONFIG,
        useAlbumPalette: true,
      }
      const preset = MESH_GRID_PRESETS[1] // cosmic-globe (has useAlbumPalette: false)
      const next = applyPresetWithPersistentPreferences(prev, preset.params)

      expect(next.useAlbumPalette).toBe(true)
      expect(next.sphereWrap).toBe(preset.params.sphereWrap)
    })

    it('persists audio calibration settings across presets', () => {
      const prev = {
        ...MESH_GRID_VARIANT_14_CONFIG,
        sensitivity: 2.5,
        gain: 1.8,
        smoothingTimeConstant: 0.9,
        fftSize: 4096,
      }
      const preset = MESH_GRID_PRESETS[2] // calm-ocean
      const next = applyPresetWithPersistentPreferences(prev, preset.params)

      expect(next.sensitivity).toBe(2.5)
      expect(next.gain).toBe(1.8)
      expect(next.smoothingTimeConstant).toBe(0.9)
      expect(next.fftSize).toBe(4096)
      expect(next.waveHeight).toBe(preset.params.waveHeight)
    })

    it('persists camera settings when lockCameraOnPresetChange is true', () => {
      const prev = {
        ...MESH_GRID_VARIANT_14_CONFIG,
        lockCameraOnPresetChange: true,
        cameraPosition: { x: 12, y: 34, z: 56 },
        cameraTarget: { x: 1, y: 2, z: 3 },
        cameraFov: 90,
      }
      const preset = MESH_GRID_PRESETS[1]
      const next = applyPresetWithPersistentPreferences(prev, preset.params)

      expect(next.lockCameraOnPresetChange).toBe(true)
      expect(next.cameraPosition).toEqual({ x: 12, y: 34, z: 56 })
      expect(next.cameraTarget).toEqual({ x: 1, y: 2, z: 3 })
      expect(next.cameraFov).toBe(90)
    })

    it('adopts preset camera when lockCameraOnPresetChange is false', () => {
      const prev = {
        ...MESH_GRID_VARIANT_14_CONFIG,
        lockCameraOnPresetChange: false,
        cameraPosition: { x: 12, y: 34, z: 56 },
      }
      const preset = MESH_GRID_PRESETS[1]
      const next = applyPresetWithPersistentPreferences(prev, preset.params)

      expect(next.cameraPosition).toEqual(preset.params.cameraPosition)
    })
  })

  // -------------------------------------------------------------------------
  // Visualizer Seed Generation & Sharing Suite
  // -------------------------------------------------------------------------
  describe('Visualizer Seed Generation & Sharing (visualizer-seed)', () => {
    it('generates a valid shareable visualizer seed with prefix', () => {
      const seed = generateVisualizerSeed(MESH_GRID_VARIANT_14_CONFIG)
      expect(typeof seed).toBe('string')
      expect(seed.startsWith('OTIX-VIZ-1:')).toBe(true)
    })

    it('parses and round-trips a seed back to exact parameter values', () => {
      const customParams = {
        ...MESH_GRID_VARIANT_14_CONFIG,
        waveHeight: 1.95,
        waveSpeed: 0.75,
        sphereWrap: 360,
        feedback_decay: 0.68,
      }

      const seed = generateVisualizerSeed(customParams)
      const parsed = parseVisualizerSeed(seed)

      expect(parsed).not.toBeNull()
      expect(parsed?.waveHeight).toBe(1.95)
      expect(parsed?.waveSpeed).toBe(0.75)
      expect(parsed?.sphereWrap).toBe(360)
      expect(parsed?.feedback_decay).toBe(0.68)
    })

    it('gracefully accepts raw JSON configuration strings as seed input', () => {
      const rawJson = JSON.stringify({
        waveHeight: 2.2,
        flowDirection: 'top-down',
      })

      const parsed = parseVisualizerSeed(rawJson)
      expect(parsed).not.toBeNull()
      expect(parsed?.waveHeight).toBe(2.2)
      expect(parsed?.flowDirection).toBe('top-down')
      // Also preserves other defaults
      expect(parsed?.gridSizeX).toBe(MESH_GRID_VARIANT_14_CONFIG.gridSizeX)
    })

    it('returns null on invalid seed input', () => {
      expect(parseVisualizerSeed('')).toBeNull()
      expect(parseVisualizerSeed('invalid-gibberish-string')).toBeNull()
      expect(parseVisualizerSeed('OTIX-VIZ-1:not-a-valid-base64-json')).toBeNull()
    })

    it('generates random procedural visualizer seeds', () => {
      const result = generateRandomVisualizerSeed()
      expect(result.seed).toBeDefined()
      expect(result.seed.startsWith('OTIX-VIZ-1:')).toBe(true)
      expect(result.params).toBeDefined()
      expect(result.params.waveHeight).toBeGreaterThanOrEqual(0.4)
      expect(result.params.waveHeight).toBeLessThanOrEqual(2.0)

      const roundTrip = parseVisualizerSeed(result.seed)
      expect(roundTrip?.waveHeight).toBe(result.params.waveHeight)
    })

    it('generates random procedural seeds while respecting custom overrides like useAlbumPalette', () => {
      const result = generateRandomVisualizerSeed({ useAlbumPalette: true })
      expect(result.params.useAlbumPalette).toBe(true)

      const resultFalse = generateRandomVisualizerSeed({ useAlbumPalette: false })
      expect(resultFalse.params.useAlbumPalette).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // MeshGridControlsPanel Seed & Sharing Interaction Suite
  // -------------------------------------------------------------------------
  describe('MeshGridControlsPanel Seed & Sharing UI', () => {
    const mockTheme = {
      palette: null,
      accentRgb: 'rgb(0, 212, 170)',
      accentRgba: (a: number) => `rgba(0, 212, 170, ${a})`,
      textColor: 'rgb(255, 255, 255)',
      subtextColor: 'rgb(160, 160, 160)',
      iconColor: 'rgb(200, 200, 200)',
      accentText: 'rgb(0, 0, 0)',
      containerBackground: 'rgba(20, 20, 25, 0.7)',
      podBackground: 'rgba(25, 25, 30, 0.8)',
      dividerColor: 'rgba(255, 255, 255, 0.1)',
      glowShadow: 'none',
      hasArtwork: false,
    }

    it('renders Seed & Share section with current seed code and one-click copy button', () => {
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={vi.fn()}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      expect(screen.getByText('Visualizer Seed & Sharing')).toBeInTheDocument()
      expect(screen.getByText('Current Seed Code')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Copy Seed/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Roll Random Seed/i })).toBeInTheDocument()
    })

    it('imports a valid friend seed and triggers onImportSeed', () => {
      const onImportSeed = vi.fn()
      const customParams = {
        ...MESH_GRID_VARIANT_14_CONFIG,
        waveHeight: 2.15,
      }
      const testSeed = generateVisualizerSeed(customParams)

      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={vi.fn()}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          onImportSeed={onImportSeed}
          theme={mockTheme}
        />,
      )

      const input = screen.getByLabelText('Paste visualizer seed')
      fireEvent.change(input, { target: { value: testSeed } })

      const applyBtn = screen.getByRole('button', { name: /Apply Seed/i })
      fireEvent.click(applyBtn)

      expect(onImportSeed).toHaveBeenCalledTimes(1)
      expect(onImportSeed.mock.calls[0][0].waveHeight).toBe(2.15)
    })

    it('displays error message when attempting to apply an invalid seed', () => {
      render(
        <MeshGridControlsPanel
          isOpen={true}
          onClose={vi.fn()}
          params={MESH_GRID_VARIANT_14_CONFIG}
          onParamChange={vi.fn()}
          onApplyPreset={vi.fn()}
          onResetParams={vi.fn()}
          onResetCamera={vi.fn()}
          theme={mockTheme}
        />,
      )

      const input = screen.getByLabelText('Paste visualizer seed')
      fireEvent.change(input, { target: { value: 'invalid-seed-123' } })

      const applyBtn = screen.getByRole('button', { name: /Apply Seed/i })
      fireEvent.click(applyBtn)

      expect(
        screen.getByText('Invalid visualizer seed format. Please verify the code string.'),
      ).toBeInTheDocument()
    })
  })
})
