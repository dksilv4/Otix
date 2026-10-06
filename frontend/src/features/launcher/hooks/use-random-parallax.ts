import { useState, useEffect, useRef } from 'react'

export const useRandomParallax = () => {
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const frameRef = useRef<number>(0)
  const runningRef = useRef(true)

  useEffect(() => {
    const phase = Math.random() * Math.PI * 2
    const speeds = [0.3 + Math.random() * 0.4, 0.5 + Math.random() * 0.3, 0.2 + Math.random() * 0.5]
    const amps = [0.6 + Math.random() * 0.4, 0.5 + Math.random() * 0.5, 0.35 + Math.random() * 0.3]
    let t = phase

    const animate = () => {
      if (!runningRef.current) {
        return
      }
      t += 0.003
      setOffset({
        x: Math.sin(t * speeds[0]) * amps[0] + Math.cos(t * speeds[1]) * amps[1],
        y: Math.cos(t * speeds[1]) * amps[0] + Math.sin(t * speeds[2]) * amps[2],
      })
      frameRef.current = requestAnimationFrame(animate)
    }
    frameRef.current = requestAnimationFrame(animate)

    // Pause on visibility loss / page hide
    const onHidden = () => { runningRef.current = false }
    const onVisible = () => { runningRef.current = true }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) onHidden()
      else onVisible()
    })
    window.addEventListener('pagehide', onHidden)
    window.addEventListener('pageshow', onVisible)

    return () => {
      cancelAnimationFrame(frameRef.current)
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onHidden)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [])

  return offset
}
