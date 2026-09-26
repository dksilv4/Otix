import { useEffect, useRef } from 'react'

export function useResetConnectionTest(
  connection: { host: string; port: number; apiKey: string; useSsl: boolean; urlBase: string },
  reset: () => void,
) {
  const fingerprint = `${connection.host}\0${connection.port}\0${connection.apiKey}\0${connection.useSsl}\0${connection.urlBase}`
  const previous = useRef(fingerprint)
  useEffect(() => {
    if (previous.current === fingerprint) return
    previous.current = fingerprint
    reset()
  }, [fingerprint, reset])
}
