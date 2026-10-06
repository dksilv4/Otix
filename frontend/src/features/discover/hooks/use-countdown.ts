import { useState, useRef, useEffect } from 'react'
import { formatTimeRemaining } from '../utils/free-games'

export const useCountdown = (dateStr: string | null | undefined): string | null => {
  const [label, setLabel] = useState(() => formatTimeRemaining(dateStr))
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setLabel(formatTimeRemaining(dateStr))
    if (!dateStr) return
    intervalRef.current = setInterval(() => {
      setLabel(formatTimeRemaining(dateStr))
    }, 60_000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [dateStr])

  return label
}
