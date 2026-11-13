import type { AudioFrameData } from '../types'
import { subscribeActiveAudioElement } from '@/lib/player/utils'

const FFT_SIZE = 256
const BIN_COUNT = FFT_SIZE / 2 // 128 bins

class AudioVisualizerEngine {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private bassFilter: BiquadFilterNode | null = null
  private bassAnalyser: AnalyserNode | null = null
  private onsetAnalyser: AnalyserNode | null = null
  private sourceNodeMap = new Map<HTMLAudioElement, MediaElementAudioSourceNode>()
  private currentAudioEl: HTMLAudioElement | null = null
  private rawFreqData = new Uint8Array(BIN_COUNT)
  private rawWaveData = new Uint8Array(BIN_COUNT)
  private rawBassWaveData = new Uint8Array(BIN_COUNT)
  private rawOnsetFreqData = new Uint8Array(1024)
  private highResFreqData: Uint8Array | null = null
  private unsubscribeElListener: (() => void) | null = null

  // Tunable audio analyzer parameters
  private currentFftSize = FFT_SIZE
  private currentSmoothing = 0.72
  private currentSensitivity = 1.0
  private currentGain = 1.0

  // Smoothed energy envelopes
  private smoothedBass = 0
  private smoothedMid = 0
  private smoothedTreble = 0
  private smoothedEnergy = 0
  private beatDecay = 0
  private lastBeatTime = 0

  // Real-time BPM and tempo rhythm tracker
  private smoothedBpm = 120
  private beatIntervals: number[] = []

  constructor() {
    this.initAudioTracking()
  }

  private resumeAudioContext = () => {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {})
    }
  }

  private initAudioTracking() {
    if (typeof window === 'undefined') return

    // Active capture-phase listeners on window: any click, keypress, or touch resumes the AudioContext
    window.addEventListener('click', this.resumeAudioContext, true)
    window.addEventListener('pointerdown', this.resumeAudioContext, true)
    window.addEventListener('keydown', this.resumeAudioContext, true)
    window.addEventListener('touchstart', this.resumeAudioContext, true)

    this.unsubscribeElListener = subscribeActiveAudioElement((el) => {
      this.attachToAudioElement(el)
    })
  }

  private attachToAudioElement(el: HTMLAudioElement | null) {
    if (!el || this.currentAudioEl === el) return
    this.currentAudioEl = el

    // Attach play & playing listeners directly on the audio element to ensure AudioContext stays running
    el.addEventListener('play', this.resumeAudioContext)
    el.addEventListener('playing', this.resumeAudioContext)

    // Connecting an audio element to AudioContext might fail if cross-origin isn't allowed.
    // We attempt safely and fall back to synthesis without disrupting playback.
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return

      if (!this.audioContext) {
        this.audioContext = new AudioCtx()
      }

      this.resumeAudioContext()

      if (!this.analyser) {
        this.analyser = this.audioContext.createAnalyser()
        this.analyser.fftSize = this.currentFftSize
        this.analyser.smoothingTimeConstant = this.currentSmoothing
        this.analyser.connect(this.audioContext.destination)
      }

      if (!this.onsetAnalyser) {
        this.onsetAnalyser = this.audioContext.createAnalyser()
        this.onsetAnalyser.fftSize = 2048
        this.onsetAnalyser.smoothingTimeConstant = 0
        this.onsetAnalyser.minDecibels = -100
        this.onsetAnalyser.maxDecibels = -30
      }

      if (!this.bassFilter) {
        this.bassFilter = this.audioContext.createBiquadFilter()
        this.bassFilter.type = 'lowpass'
        this.bassFilter.frequency.value = 150 // Strict 150 Hz cutoff: completely excludes vocals, snares, guitars
        this.bassFilter.Q.value = 1.0

        this.bassAnalyser = this.audioContext.createAnalyser()
        this.bassAnalyser.fftSize = FFT_SIZE
        this.bassAnalyser.smoothingTimeConstant = 0.62
      }

      // Check if source node was already created for this audio element
      let sourceNode = this.sourceNodeMap.get(el)
      if (!sourceNode) {
        sourceNode = this.audioContext.createMediaElementSource(el)
        this.sourceNodeMap.set(el, sourceNode)
        // Connect to analyser (analyser is already connected to audioContext.destination)
        sourceNode.connect(this.analyser)

        // Connect dedicated onset analyzer for zero-lag transient detection
        if (this.onsetAnalyser) {
          sourceNode.connect(this.onsetAnalyser)
        }

        // Connect dedicated lowpass bass analyzer (pure analysis, not connected to destination)
        if (this.bassFilter && this.bassAnalyser) {
          sourceNode.connect(this.bassFilter)
          this.bassFilter.connect(this.bassAnalyser)
        }
      }
    } catch {
      // CORS taint or browser restrictions prevent Web Audio connection.
      // Synthesis fallback takes over seamlessly without silencing playback.
    }
  }

  public getAudioFrame(positionMs: number, durationMs: number, isPlaying: boolean): AudioFrameData {
    if (isPlaying && this.audioContext?.state === 'suspended') {
      this.resumeAudioContext()
    }
    if (!isPlaying) {
      this.smoothedBass = 0
      this.smoothedMid = 0
      this.smoothedTreble = 0
      this.smoothedEnergy = 0
      this.beatDecay = 0
      for (let i = 0; i < BIN_COUNT; i++) {
        this.rawFreqData[i] = 0
        this.rawWaveData[i] = 128
        this.rawBassWaveData[i] = 128
      }
      return {
        frequencyData: this.rawFreqData,
        waveformData: this.rawWaveData,
        bassWaveformData: this.rawBassWaveData,
        bass: 0,
        mid: 0,
        treble: 0,
        energy: 0,
        beat: 0,
        isPlaying: false,
        position: positionMs,
        duration: durationMs,
        bpm: 0,
        tempo: 1.0,
        beatPhase: 0,
        tempoPulse: 0,
      }
    }

    let hasLiveAudio = false

    if (this.analyser && isPlaying) {
      try {
        if (this.highResFreqData) {
          this.analyser.getByteFrequencyData(this.highResFreqData as any)
          // Downsample high-res to standard 128 bins for rawFreqData
          const hrLen = this.highResFreqData.length
          const ratio = hrLen / BIN_COUNT
          for (let i = 0; i < BIN_COUNT; i++) {
            const start = Math.floor(i * ratio)
            const end = Math.floor((i + 1) * ratio)
            let maxVal = 0
            for (let j = start; j < end; j++) {
              if (this.highResFreqData[j] > maxVal) maxVal = this.highResFreqData[j]
            }
            this.rawFreqData[i] = Math.min(255, Math.round(maxVal * this.currentGain))
          }
        } else {
          this.analyser.getByteFrequencyData(this.rawFreqData)
          if (this.currentGain !== 1.0) {
            for (let i = 0; i < BIN_COUNT; i++) {
              this.rawFreqData[i] = Math.min(255, Math.round(this.rawFreqData[i] * this.currentGain))
            }
          }
        }
        this.analyser.getByteTimeDomainData(this.rawWaveData)

        // Capture pure zero-lag onset data for razor-sharp transient beat detection
        if (this.onsetAnalyser) {
          this.onsetAnalyser.getByteFrequencyData(this.rawOnsetFreqData)
        }

        // If dedicated bass analyzer is active, capture pure low-pass bass time-domain waveform
        if (this.bassAnalyser) {
          this.bassAnalyser.getByteTimeDomainData(this.rawBassWaveData)
        }

        // Check if there is actual non-zero frequency data
        let sum = 0
        for (let i = 0; i < 24; i++) {
          sum += this.rawFreqData[i]
        }
        if (sum > 10) {
          hasLiveAudio = true
        }
      } catch {
        hasLiveAudio = false
      }
    }

    if (!hasLiveAudio) {
      this.generateSyntheticAudioData(positionMs, isPlaying)
    }

    // Calculate energy bands from the 128 bins with true acoustic calibration
    // Bass: Strictly isolate True Sub-Bass and Bass (0 to 180Hz) -> bins 0 and 1
    const rawBass0 = this.rawFreqData[0] || 0
    const rawBass1 = this.rawFreqData[1] || 0
    const currentBass = (rawBass0 * 0.75 + rawBass1 * 0.25) / 255

    // Mid/Vocals: bins 2 to 24 (~344Hz - 4200Hz)
    let midSum = 0
    for (let i = 2; i <= 24; i++) {
      midSum += this.rawFreqData[i]
    }
    const currentMid = midSum / (23 * 255)

    // Treble/Instruments: bins 25 to 127 (~4200Hz - 22000Hz)
    let trebleSum = 0
    for (let i = 25; i < BIN_COUNT; i++) {
      trebleSum += this.rawFreqData[i]
    }
    const currentTreble = trebleSum / ((BIN_COUNT - 25) * 255)

    const currentEnergy = currentBass * 0.5 + currentMid * 0.35 + currentTreble * 0.15

    // Smooth envelopes (attack fast, release smooth)
    const smoothRate = isPlaying ? 0.3 : 0.1
    this.smoothedBass += (currentBass - this.smoothedBass) * smoothRate
    this.smoothedMid += (currentMid - this.smoothedMid) * smoothRate
    this.smoothedTreble += (currentTreble - this.smoothedTreble) * smoothRate
    this.smoothedEnergy += (currentEnergy - this.smoothedEnergy) * smoothRate

    // Real-time dynamic beat detection using onset analyzer if available
    let onsetBass = currentBass
    if (this.onsetAnalyser && hasLiveAudio) {
      const o0 = this.rawOnsetFreqData[0] || 0
      const o1 = this.rawOnsetFreqData[1] || 0
      const o2 = this.rawOnsetFreqData[2] || 0
      const onsetVal = ((o0 * 0.5 + o1 * 0.35 + o2 * 0.15) / 255) * this.currentSensitivity
      onsetBass = Math.max(currentBass, onsetVal)
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const beatThreshold = Math.max(0.48, this.smoothedBass * 1.25)

    if (onsetBass > beatThreshold && now - this.lastBeatTime > 260) {
      if (this.lastBeatTime > 0) {
        const interval = now - this.lastBeatTime
        if (interval >= 260 && interval <= 1600) {
          this.beatIntervals.push(interval)
          if (this.beatIntervals.length > 12) {
            this.beatIntervals.shift()
          }

          if (this.beatIntervals.length >= 3) {
            const sorted = [...this.beatIntervals].sort((a, b) => a - b)
            const medianInterval = sorted[Math.floor(sorted.length / 2)]
            let instantBpm = 60000 / medianInterval

            // Keep within typical human music tempo range (60 - 180 BPM)
            while (instantBpm < 65) instantBpm *= 2
            while (instantBpm > 185) instantBpm /= 2

            this.smoothedBpm += (instantBpm - this.smoothedBpm) * 0.14
          }
        }
      }
      this.beatDecay = 1.0
      this.lastBeatTime = now
    } else {
      this.beatDecay = Math.max(0, this.beatDecay * 0.88)
    }

    const currentBpm = Math.round(this.smoothedBpm)
    const tempo = this.smoothedBpm / 120
    const beatPeriod = 60000 / Math.max(40, this.smoothedBpm)
    const timeSinceBeat = Math.max(0, now - this.lastBeatTime)
    const beatPhase = (timeSinceBeat % beatPeriod) / beatPeriod
    const tempoPulse = Math.max(this.beatDecay, Math.exp(-beatPhase * 4.0))

    return {
      frequencyData: this.rawFreqData,
      waveformData: this.rawWaveData,
      bassWaveformData: this.rawBassWaveData,
      highResFrequencyData: this.highResFreqData ?? undefined,
      bass: Math.min(1, Math.max(0, this.smoothedBass)),
      mid: Math.min(1, Math.max(0, this.smoothedMid)),
      treble: Math.min(1, Math.max(0, this.smoothedTreble)),
      energy: Math.min(1, Math.max(0, this.smoothedEnergy)),
      beat: this.beatDecay,
      isPlaying,
      position: positionMs,
      duration: durationMs,
      bpm: currentBpm,
      tempo,
      beatPhase,
      tempoPulse,
    }
  }

  /**
   * Generates rhythmic, beat-synchronized frequency & waveform spectrums
   * when live Web Audio API is unavailable (e.g. CORS protected remote streams).
   */
  private generateSyntheticAudioData(positionMs: number, isPlaying: boolean) {
    if (!isPlaying) {
      // Resting idle state
      for (let i = 0; i < BIN_COUNT; i++) {
        this.rawFreqData[i] = Math.max(0, Math.floor(this.rawFreqData[i] * 0.9))
        this.rawWaveData[i] = 128
        this.rawBassWaveData[i] = 128
      }
      return
    }

    const t = positionMs / 1000
    // 124 BPM -> ~2.066 beats per second -> period ~0.4838s
    const beatPhase = (t % 0.4838) / 0.4838
    const kickEnvelope = Math.exp(-beatPhase * 6.0)
    const snarePhase = ((t + 0.2419) % 0.4838) / 0.4838
    const snareEnvelope = Math.exp(-snarePhase * 7.5)
    const hiHatTick = (t * 8.26) % 1.0 < 0.14 ? 1.0 : 0.2

    // Initialize all bins to quiet acoustic noise floor (5 - 12)
    for (let i = 0; i < BIN_COUNT; i++) {
      this.rawFreqData[i] = 6 + (i % 3)
    }

    // Discrete individual frequency peaks with narrow Gaussian profiles:
    // 1. Sub-bass kick (Bin 1: ~45Hz) & Sub rumble (Bin 0: ~25Hz)
    this.rawFreqData[0] = Math.min(255, Math.round(kickEnvelope * 210 + 15))
    this.rawFreqData[1] = Math.min(255, Math.round(kickEnvelope * 255 + 20))
    this.rawFreqData[2] = Math.min(255, Math.round(kickEnvelope * 110 + 10))

    // 2. Bassline harmonic notes (Bin 4: ~110Hz, Bin 7: ~180Hz, Bin 10: ~260Hz)
    const bassNote1 = Math.max(0, Math.sin(t * 7.8)) * 190
    const bassNote2 = Math.max(0, Math.cos(t * 5.2)) * 170
    this.rawFreqData[4] = Math.min(255, Math.round(bassNote1 + kickEnvelope * 60 + 12))
    this.rawFreqData[5] = Math.min(255, Math.round(bassNote1 * 0.4 + 8))
    this.rawFreqData[7] = Math.min(255, Math.round(bassNote2 + 10))
    this.rawFreqData[10] = Math.min(255, Math.round(bassNote1 * 0.7 + bassNote2 * 0.5 + 8))

    // 3. Snare & Low-mid fundamentals (Bin 16: ~420Hz, Bin 22: ~600Hz)
    this.rawFreqData[16] = Math.min(255, Math.round(snareEnvelope * 220 + 10))
    this.rawFreqData[17] = Math.min(255, Math.round(snareEnvelope * 160 + 8))
    this.rawFreqData[22] = Math.min(255, Math.round(Math.abs(Math.sin(t * 11)) * 150 + snareEnvelope * 80 + 10))

    // 4. Vocal and synthesizer lead frequencies (Bin 29: ~1.2kHz, Bin 38: ~1.9kHz, Bin 48: ~2.8kHz)
    const melody1 = (Math.sin(t * 14.5) * 0.5 + 0.5) * 175
    const melody2 = (Math.cos(t * 9.2) * 0.5 + 0.5) * 155
    this.rawFreqData[28] = Math.min(255, Math.round(melody1 * 0.3 + 8))
    this.rawFreqData[29] = Math.min(255, Math.round(melody1 + 12))
    this.rawFreqData[30] = Math.min(255, Math.round(melody1 * 0.35 + 8))

    this.rawFreqData[38] = Math.min(255, Math.round(melody2 + 10))
    this.rawFreqData[48] = Math.min(255, Math.round(melody1 * 0.6 + melody2 * 0.6 + 8))

    // 5. Treble / Hi-hat & Percussion harmonics (Bin 68: ~5kHz, Bin 82: ~8kHz, Bin 98: ~12kHz, Bin 116: ~18kHz)
    // Realistic acoustic rolloff so treble provides subtle texture without overpowering the outer mesh
    const hatSpike = hiHatTick * 32
    this.rawFreqData[68] = Math.min(255, Math.round(snareEnvelope * 35 + hatSpike * 0.4 + 8))
    this.rawFreqData[82] = Math.min(255, Math.round(hatSpike + 10))
    this.rawFreqData[98] = Math.min(255, Math.round(hatSpike * 0.75 + 8))
    this.rawFreqData[116] = Math.min(255, Math.round(hatSpike * 0.5 + 6))

    // Synthesize oscillating time-domain waveform around 128
    for (let i = 0; i < BIN_COUNT; i++) {
      const waveNorm = i / BIN_COUNT
      const wave1 = Math.sin(waveNorm * Math.PI * 8 + t * 14)
      const wave2 = Math.sin(waveNorm * Math.PI * 18 - t * 22) * 0.4
      const combined = (wave1 + wave2) * (kickEnvelope * 0.7 + 0.3) * 60
      this.rawWaveData[i] = Math.min(255, Math.max(0, Math.round(128 + combined)))

      // Isolated pure bass physical waveform (strictly responds to kick/sub impulse)
      const bassDisplacement = Math.sin(waveNorm * Math.PI * 3 + t * 8) * kickEnvelope * 90
      this.rawBassWaveData[i] = Math.min(255, Math.max(0, Math.round(128 + bassDisplacement)))
    }
  }

  public setConfig(config: {
    fftSize?: number
    smoothingTimeConstant?: number
    sensitivity?: number
    gain?: number
  }) {
    if (config.fftSize !== undefined && config.fftSize !== this.currentFftSize) {
      const val = config.fftSize
      if (val >= 32 && val <= 32768 && (val & (val - 1)) === 0) {
        this.currentFftSize = val
        if (this.analyser) {
          this.analyser.fftSize = val
        }
        if (val > FFT_SIZE) {
          this.highResFreqData = new Uint8Array(val / 2)
        } else {
          this.highResFreqData = null
        }
      }
    }
    if (config.smoothingTimeConstant !== undefined) {
      this.currentSmoothing = Math.max(0, Math.min(1, config.smoothingTimeConstant))
      if (this.analyser) {
        this.analyser.smoothingTimeConstant = this.currentSmoothing
      }
    }
    if (config.sensitivity !== undefined) {
      this.currentSensitivity = Math.max(0.1, config.sensitivity)
    }
    if (config.gain !== undefined) {
      this.currentGain = Math.max(0.1, config.gain)
    }
  }

  public destroy() {
    this.unsubscribeElListener?.()
    this.unsubscribeElListener = null

    try {
      this.onsetAnalyser?.disconnect()
    } catch {}
    this.onsetAnalyser = null

    try {
      this.bassFilter?.disconnect()
    } catch {}
    this.bassFilter = null

    try {
      this.bassAnalyser?.disconnect()
    } catch {}
    this.bassAnalyser = null

    try {
      this.analyser?.disconnect()
    } catch {}
    this.analyser = null

    for (const sourceNode of this.sourceNodeMap.values()) {
      try {
        sourceNode.disconnect()
      } catch {}
    }
    this.sourceNodeMap.clear()
    this.currentAudioEl = null

    try {
      this.audioContext?.close().catch(() => {})
    } catch {
      // Ignored
    }
    this.audioContext = null
  }
}

export const audioVisualizerEngine = new AudioVisualizerEngine()
