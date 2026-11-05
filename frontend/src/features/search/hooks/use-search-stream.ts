import { useState, useEffect, useRef } from 'react'
import { convertKeysToCamelCase } from '@/lib/api/client'
import type { MediaItemSummary } from '@media/queries/media-queries'
import type { DoneEventPayload, SearchStreamState } from '../types'

interface UseSearchStreamOptions {
  query: string
  type?: string
  sort?: string
  limit?: number
  debounceMs?: number
  enabled?: boolean
}

export const useSearchStream = ({
  query,
  type = 'all',
  sort = '',
  limit = 24,
  debounceMs = 200,
  enabled = true,
}: UseSearchStreamOptions): SearchStreamState => {
  const [state, setState] = useState<SearchStreamState>({
    items: [],
    localItems: [],
    externalItems: [],
    isStreaming: false,
    isLocalDone: false,
    isDone: false,
    error: null,
    totalLocal: 0,
    totalExternal: 0,
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const trimmed = query.trim()

    // Clear any pending debounce
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // Cancel any in-flight stream immediately
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    if (!enabled || !trimmed) {
      setState({
        items: [],
        localItems: [],
        externalItems: [],
        isStreaming: false,
        isLocalDone: false,
        isDone: false,
        error: null,
        totalLocal: 0,
        totalExternal: 0,
      })
      return
    }

    // Set streaming state immediately for UI responsiveness
    setState((prev) => ({
      ...prev,
      isStreaming: true,
      isLocalDone: false,
      isDone: false,
      error: null,
    }))

    debounceTimerRef.current = setTimeout(async () => {
      const controller = new AbortController()
      abortControllerRef.current = controller

      const mediaTypeParam = type && type !== 'all' && type !== 'person' && type !== 'user' ? type : ''
      const params = new URLSearchParams({
        q: trimmed,
        ...(mediaTypeParam ? { media_type: mediaTypeParam } : {}),
        ...(sort ? { sort_by: sort } : {}),
        limit: String(limit),
      })

      const url = `/api/v1/search/stream?${params.toString()}`

      try {
        const response = await fetch(url, {
          headers: { Accept: 'text/event-stream' },
          signal: controller.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(`SSE stream failed with status ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let currentEvent = 'message'
        let currentLocal: MediaItemSummary[] = []
        let currentExternal: MediaItemSummary[] = []

        while (true) {
          const { value, done } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmedLine = line.trim()
            if (!trimmedLine) {
              currentEvent = 'message'
              continue
            }

            if (trimmedLine.startsWith('event:')) {
              currentEvent = trimmedLine.slice(6).trim()
            } else if (trimmedLine.startsWith('data:')) {
              const rawData = trimmedLine.slice(5).trim()
              try {
                const parsed = JSON.parse(rawData)
                const converted = convertKeysToCamelCase(parsed)

                if (currentEvent === 'local') {
                  const incoming = Array.isArray(converted) ? (converted as MediaItemSummary[]) : []
                  currentLocal = incoming
                  setState((prev) => ({
                    ...prev,
                    localItems: incoming,
                    items: [...incoming, ...currentExternal],
                    isLocalDone: true,
                    totalLocal: incoming.length,
                  }))
                } else if (currentEvent === 'external') {
                  const incoming = Array.isArray(converted) ? (converted as MediaItemSummary[]) : []
                  currentExternal = incoming
                  const seenIds = new Set(currentLocal.map((i) => String(i.id)))
                  const dedupedExternal = incoming.filter((i) => !seenIds.has(String(i.id)))
                  setState((prev) => ({
                    ...prev,
                    externalItems: incoming,
                    items: [...currentLocal, ...dedupedExternal],
                    totalExternal: incoming.length,
                  }))
                } else if (currentEvent === 'done') {
                  const doneData = converted as DoneEventPayload
                  setState((prev) => ({
                    ...prev,
                    isStreaming: false,
                    isDone: true,
                    totalLocal: doneData.totalLocal ?? prev.totalLocal,
                    totalExternal: doneData.totalExternal ?? prev.totalExternal,
                  }))
                }
              } catch {
                // Ignore parse errors on malformed chunks
              }
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === 'AbortError') {
          return // Clean abort on keystroke cancellation
        }
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          isDone: true,
          error: err as Error,
        }))
      }
    }, debounceMs)

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [query, type, sort, limit, debounceMs, enabled])

  return state
}
