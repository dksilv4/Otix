import type { Channel, NotificationEvent, NotificationPreferences } from '../types'

let audioCtx: AudioContext | null = null

function playChime() {
  try {
    if (!audioCtx) audioCtx = new AudioContext()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.2)
  } catch {
    // Audio not available — silently no-op
  }
}

export function createSoundChannel(prefs: NotificationPreferences): Channel {
  return {
    name: 'sound',
    canDeliver: (event: NotificationEvent) => {
      return prefs[event.type] !== false && prefs._sound_enabled === true
    },
    deliver: () => {
      playChime()
    },
  }
}
