import { useState, useEffect, useRef } from 'react'
import type { AudioFrameData } from '../types'
import { audioVisualizerEngine } from '../utils/audio-analyzer'

export const useAudioVisualizer = (
  positionMs: number,
  durationMs: number,
  isPlaying: boolean,
  active = true,
): AudioFrameData => {
  const [frame, setFrame] = useState<AudioFrameData>(() =>
    audioVisualizerEngine.getAudioFrame(positionMs, durationMs, isPlaying),
  )

  const posRef = useRef(positionMs)
  const durRef = useRef(durationMs)
  const playingRef = useRef(isPlaying)

  useEffect(() => {
    posRef.current = positionMs
  }, [positionMs])

  useEffect(() => {
    durRef.current = durationMs
  }, [durationMs])

  useEffect(() => {
    playingRef.current = isPlaying
    setFrame(audioVisualizerEngine.getAudioFrame(posRef.current, durRef.current, isPlaying))
  }, [isPlaying])

  useEffect(() => {
    if (!active) return

    let animId: number
    let lastUpdate = 0
    let lastBpm = -1

    const tick = (now: number) => {
      const nextFrame = audioVisualizerEngine.getAudioFrame(
        posRef.current,
        durRef.current,
        playingRef.current,
      )
      const currentBpm = Math.round(nextFrame.bpm ?? 0)
      const timeSinceLast = now - lastUpdate

      if (timeSinceLast >= 1000 || (Math.abs(currentBpm - lastBpm) > 1 && timeSinceLast >= 500)) {
        lastUpdate = now
        lastBpm = currentBpm
        setFrame(nextFrame)
      }

      animId = requestAnimationFrame(tick)
    }

    animId = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(animId)
    }
  }, [active])

  return frame
}
