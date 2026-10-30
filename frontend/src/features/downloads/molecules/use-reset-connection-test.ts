import { useEffect, useRef } from 'react'

export function useResetConnectionTest<T extends Record<string, unknown> | readonly unknown[]>(
  dependencies: T,
  reset: () => void,
) {
  const fingerprint = JSON.stringify(dependencies)
  const previous = useRef(fingerprint)
  useEffect(() => {
    if (previous.current === fingerprint) return
    previous.current = fingerprint
    reset()
  }, [fingerprint, reset])
}
