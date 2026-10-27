import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { clearDesktopAPICache, type NodeDaemonStatus } from '@/lib/desktop/api'
import { useCompanionNode } from '../hooks/use-companion-node'
import { probeLocalGameNode, unclaimLocalGameNode } from '@/features/downloads/pending-nodes'
import { SettingsNodeProvider, useSettingsNode } from '../context/settings-node-context'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

describe('useCompanionNode - Adversarial & Stress Suite', () => {
  let unhandledRejections: unknown[] = []
  let onUnhandledRejection: (e: PromiseRejectionEvent) => void
  let nodeUnhandledRejectionListener: (reason: unknown) => void

  beforeEach(() => {
    clearDesktopAPICache()
    delete (window as unknown as { desktopAPI?: unknown }).desktopAPI
    unhandledRejections = []

    onUnhandledRejection = (e: PromiseRejectionEvent) => {
      unhandledRejections.push(e.reason)
    }
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('unhandledrejection', onUnhandledRejection)
    }

    nodeUnhandledRejectionListener = (reason: unknown) => {
      unhandledRejections.push(reason)
    }
    process.on('unhandledRejection', nodeUnhandledRejectionListener)
  })

  afterEach(() => {
    clearDesktopAPICache()
    delete (window as unknown as { desktopAPI?: unknown }).desktopAPI
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
    process.off('unhandledRejection', nodeUnhandledRejectionListener)
  })

  // =========================================================================
  // 1. Stress test unmounting and remounting during live status-changed events
  // =========================================================================
  describe('1. Unmount & Remount Stress under Live Events', () => {
    it('handles 50 rapid mount/unmount cycles while status change events are firing without leaks or errors', async () => {
      let listener: ((status: NodeDaemonStatus) => void) | null = null
      const unsubscribeMocks: Array<ReturnType<typeof vi.fn>> = []

      ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
        nodeDaemon: {
          getStatus: vi.fn().mockResolvedValue({
            running: false,
            embedded: true,
            port: 8090,
          }),
          start: vi.fn(),
          stop: vi.fn(),
          restart: vi.fn(),
          onStatusChanged: vi.fn().mockImplementation((cb: (s: NodeDaemonStatus) => void) => {
            listener = cb
            const unsub = vi.fn(() => {
              if (listener === cb) listener = null
            })
            unsubscribeMocks.push(unsub)
            return unsub
          }),
        },
      }

      // Execute 50 rapid mount and unmount iterations
      for (let i = 0; i < 50; i++) {
        const { unmount } = renderHook(() => useCompanionNode())

        // Fire status events mid-lifecycle
        if (listener) {
          act(() => {
            listener?.({
              running: i % 2 === 0,
              embedded: true,
              port: 8090 + (i % 10),
              url: `http://127.0.0.1:${8090 + (i % 10)}`,
            })
          })
        }

        // Unmount
        unmount()

        // Attempt firing right after unmount to simulate stale IPC callback arrival
        if (listener) {
          act(() => {
            listener?.({
              running: true,
              embedded: true,
              port: 8099,
            })
          })
        }
      }

      // All 50 subscriptions must have had their unmount cleanup invoked
      expect(unsubscribeMocks.length).toBe(50)
      for (const unsub of unsubscribeMocks) {
        expect(unsub).toHaveBeenCalledTimes(1)
      }
      expect(unhandledRejections).toEqual([])
    })

    it('safely handles getStatus resolving AFTER component has unmounted (no state update warning or crash)', async () => {
      let resolveGetStatus!: (status: NodeDaemonStatus) => void
      const getStatusPromise = new Promise<NodeDaemonStatus>((resolve) => {
        resolveGetStatus = resolve
      })

      const onStatusChangedUnsub = vi.fn()
      ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
        nodeDaemon: {
          getStatus: vi.fn().mockReturnValue(getStatusPromise),
          start: vi.fn(),
          stop: vi.fn(),
          restart: vi.fn(),
          onStatusChanged: vi.fn().mockReturnValue(onStatusChangedUnsub),
        },
      }

      const { unmount } = renderHook(() => useCompanionNode())

      // Unmount while getStatus is still pending
      unmount()
      expect(onStatusChangedUnsub).toHaveBeenCalledTimes(1)

      // Now resolve getStatus after unmount
      await act(async () => {
        resolveGetStatus({
          running: true,
          embedded: true,
          port: 8092,
          version: '1.0.0',
        })
        await Promise.resolve()
      })

      // Zero unhandled rejections
      expect(unhandledRejections).toEqual([])
    })

    it('safely handles getStatus rejection without throwing unhandled promise rejection', async () => {
      ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
        nodeDaemon: {
          getStatus: vi.fn().mockRejectedValue(new Error('IPC channel destroyed')),
          start: vi.fn(),
          stop: vi.fn(),
          restart: vi.fn(),
          onStatusChanged: vi.fn().mockReturnValue(vi.fn()),
        },
      }

      const { result } = renderHook(() => useCompanionNode())

      await waitFor(() => {
        expect(result.current.isRunning).toBe(false)
      })

      expect(unhandledRejections).toEqual([])
    })

    it('survives 30 concurrent instances mounting and unmounting simultaneously', async () => {
      const activeListeners = new Set<(s: NodeDaemonStatus) => void>()

      ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
        nodeDaemon: {
          getStatus: vi.fn().mockResolvedValue({ running: false, port: 8090 }),
          start: vi.fn(),
          stop: vi.fn(),
          restart: vi.fn(),
          onStatusChanged: vi.fn().mockImplementation((cb: (s: NodeDaemonStatus) => void) => {
            activeListeners.add(cb)
            return () => {
              activeListeners.delete(cb)
            }
          }),
        },
      }

      const hooks = Array.from({ length: 30 }, () => renderHook(() => useCompanionNode()))
      expect(activeListeners.size).toBe(30)

      // Broadcast an event to all 30
      act(() => {
        for (const cb of activeListeners) {
          cb({ running: true, port: 8101, embedded: true })
        }
      })

      for (const h of hooks) {
        expect(h.result.current.isRunning).toBe(true)
        expect(h.result.current.port).toBe(8101)
      }

      // Unmount all 30
      for (const h of hooks) {
        h.unmount()
      }
      expect(activeListeners.size).toBe(0)
      expect(unhandledRejections).toEqual([])
    })
  })

  // =========================================================================
  // 2. Rapid port changes & daemon error states
  // =========================================================================
  describe('2. Rapid Port Changes & Error States', () => {
    it('handles rapid sequential port changes and updates to the latest port', async () => {
      let listener: ((status: NodeDaemonStatus) => void) | null = null

      ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
        nodeDaemon: {
          getStatus: vi.fn().mockResolvedValue({ running: false, port: 8090 }),
          start: vi.fn(),
          stop: vi.fn(),
          restart: vi.fn(),
          onStatusChanged: vi.fn().mockImplementation((cb: (s: NodeDaemonStatus) => void) => {
            listener = cb
            return vi.fn()
          }),
        },
      }

      const { result } = renderHook(() => useCompanionNode())

      await waitFor(() => {
        expect(listener).not.toBeNull()
      })

      const ports = [8091, 8092, 8095, 8100, 8120, 8145]
      act(() => {
        for (const p of ports) {
          listener?.({
            running: true,
            embedded: true,
            port: p,
            url: `http://127.0.0.1:${p}`,
          })
        }
      })

      expect(result.current.port).toBe(8145)
      expect(result.current.isRunning).toBe(true)
      expect(unhandledRejections).toEqual([])
    })

    it('captures crash / error state and recovers cleanly when daemon restarts', async () => {
      let listener: ((status: NodeDaemonStatus) => void) | null = null

      ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
        nodeDaemon: {
          getStatus: vi.fn().mockResolvedValue({ running: true, port: 8090 }),
          start: vi.fn(),
          stop: vi.fn(),
          restart: vi.fn(),
          onStatusChanged: vi.fn().mockImplementation((cb: (s: NodeDaemonStatus) => void) => {
            listener = cb
            return vi.fn()
          }),
        },
      }

      const { result } = renderHook(() => useCompanionNode())

      await waitFor(() => {
        expect(result.current.isRunning).toBe(true)
      })

      // Daemon crashes with critical error
      act(() => {
        listener?.({
          running: false,
          embedded: true,
          port: 8090,
          error: 'panic: runtime error: invalid memory address or nil pointer dereference',
        })
      })

      expect(result.current.isRunning).toBe(false)
      expect(result.current.error).toBe('panic: runtime error: invalid memory address or nil pointer dereference')

      // Daemon automatically restarts and recovers
      act(() => {
        listener?.({
          running: true,
          embedded: true,
          port: 8092,
          error: undefined,
          version: '1.0.1',
        })
      })

      expect(result.current.isRunning).toBe(true)
      expect(result.current.port).toBe(8092)
      expect(result.current.error).toBeNull()
      expect(unhandledRejections).toEqual([])
    })

    it('repeatedly flaps between running and error states without desynchronizing', async () => {
      let listener: ((status: NodeDaemonStatus) => void) | null = null

      ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
        nodeDaemon: {
          getStatus: vi.fn().mockResolvedValue({ running: false, port: 8090 }),
          start: vi.fn(),
          stop: vi.fn(),
          restart: vi.fn(),
          onStatusChanged: vi.fn().mockImplementation((cb: (s: NodeDaemonStatus) => void) => {
            listener = cb
            return vi.fn()
          }),
        },
      }

      const { result } = renderHook(() => useCompanionNode())

      await waitFor(() => {
        expect(listener).not.toBeNull()
      })

      for (let i = 0; i < 20; i++) {
        act(() => {
          listener?.({
            running: true,
            embedded: true,
            port: 8090 + i,
            error: undefined,
          })
        })
        expect(result.current.isRunning).toBe(true)
        expect(result.current.port).toBe(8090 + i)

        act(() => {
          listener?.({
            running: false,
            embedded: true,
            port: 8090 + i,
            error: `Crash iteration ${i}`,
          })
        })
        expect(result.current.isRunning).toBe(false)
        expect(result.current.error).toBe(`Crash iteration ${i}`)
      }
      expect(unhandledRejections).toEqual([])
    })

    it('SettingsNodeProvider does not crash when daemon transitions to error status', async () => {
      let listener: ((status: NodeDaemonStatus) => void) | null = null

      ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
        platform: 'darwin',
        nodeDaemon: {
          getStatus: vi.fn().mockResolvedValue({ running: true, port: 8090 }),
          start: vi.fn(),
          stop: vi.fn(),
          restart: vi.fn(),
          onStatusChanged: vi.fn().mockImplementation((cb: (s: NodeDaemonStatus) => void) => {
            listener = cb
            return vi.fn()
          }),
        },
      }

      const testQueryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })

      const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(
          QueryClientProvider,
          { client: testQueryClient },
          createElement(SettingsNodeProvider, { enabled: true }, children),
        )

      const { result } = renderHook(() => useSettingsNode(), { wrapper })

      await waitFor(() => {
        expect(result.current.selectedNode).not.toBeNull()
      })

      // Fire fatal daemon error
      act(() => {
        listener?.({
          running: false,
          embedded: true,
          port: 8090,
          error: 'Fatal daemon error: bind: address already in use',
        })
      })

      // Provider must remain responsive and not throw or crash
      expect(result.current.companionNode?.error).toBe('Fatal daemon error: bind: address already in use')
      expect(result.current.companionNode?.isRunning).toBe(false)
      expect(result.current.selectedNode).not.toBeNull()
      expect(unhandledRejections).toEqual([])
    })
  })

  // =========================================================================
  // 3. probeLocalGameNode adversarial tests
  // =========================================================================
  describe('3. probeLocalGameNode Adversarial Recovery', () => {
    it('returns null when daemon is offline or connection refused', async () => {
      const mockOfflineFetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8090'))

      const res = await probeLocalGameNode(mockOfflineFetch as unknown as typeof fetch, 8090)
      expect(res).toBeNull()
      expect(unhandledRejections).toEqual([])
    })

    it('handles negative, zero, and NaN ports by defaulting gracefully to 8090', async () => {
      const mockFetcher = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ server_name: 'Fallback Node' }),
      } as unknown as Response)

      const negativePortRes = await probeLocalGameNode(mockFetcher as unknown as typeof fetch, -1)
      expect(negativePortRes?.localUrl).toBe('http://127.0.0.1:8090')

      const zeroPortRes = await probeLocalGameNode(mockFetcher as unknown as typeof fetch, 0)
      expect(zeroPortRes?.localUrl).toBe('http://127.0.0.1:8090')

      const nanPortRes = await probeLocalGameNode(mockFetcher as unknown as typeof fetch, NaN)
      expect(nanPortRes?.localUrl).toBe('http://127.0.0.1:8090')
    })

    it('returns null on invalid / out-of-range ports that throw URL parse errors', async () => {
      const mockFetcher = vi.fn().mockImplementation((url: string) => {
        if (url.includes('999999')) {
          throw new TypeError('Invalid port : 999999')
        }
        return Promise.resolve({ ok: true, json: async () => ({}) } as unknown as Response)
      })

      const res = await probeLocalGameNode(mockFetcher as unknown as typeof fetch, 999999)
      expect(res).toBeNull()
      expect(unhandledRejections).toEqual([])
    })

    it('handles malformed HTML / non-JSON responses from status endpoint without crashing', async () => {
      const mockFetcher = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/v1/status')) {
          return {
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError('Unexpected token < in JSON at position 0')
            },
          } as unknown as Response
        }
        return {
          ok: false,
          status: 404,
        } as unknown as Response
      })

      const res = await probeLocalGameNode(mockFetcher as unknown as typeof fetch, 8090)
      expect(res).toBeNull()
      expect(unhandledRejections).toEqual([])
    })

    it('handles status endpoint returning literal null JSON', async () => {
      const mockFetcher = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/v1/status')) {
          return {
            ok: true,
            status: 200,
            json: async () => null,
          } as unknown as Response
        }
        return { ok: false, status: 404 } as unknown as Response
      })

      const res = await probeLocalGameNode(mockFetcher as unknown as typeof fetch, 8090)
      // When json() is null, accessing data.server_name throws TypeError which is caught
      expect(res).toBeNull()
      expect(unhandledRejections).toEqual([])
    })

    it('recovers via /api/v1/ping when /api/v1/status fails with 502/500', async () => {
      const mockFetcher = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/v1/status')) {
          return { ok: false, status: 502 } as unknown as Response
        }
        if (urlStr.includes('/api/v1/ping')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              server_name: 'Ping Recovered Node',
              claimed: true,
              claimed_by: 'alice',
            }),
          } as unknown as Response
        }
        return { ok: false, status: 404 } as unknown as Response
      })

      const res = await probeLocalGameNode(mockFetcher as unknown as typeof fetch, 8090)
      expect(res).toEqual({
        serverName: 'Ping Recovered Node',
        localUrl: 'http://127.0.0.1:8090',
        authToken: '',
        claimCode: '',
        claimed: true,
        claimedBy: 'alice',
      })
      expect(unhandledRejections).toEqual([])
    })

    it('recovers claim state via /api/v1/claim/status when /api/v1/status returns 404 (legacy node)', async () => {
      const mockFetcher = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/v1/status')) {
          return { ok: false, status: 404 } as unknown as Response
        }
        if (urlStr.includes('/api/v1/claim/status')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              claimed: false,
              claim_code: 'CODE-CLAIM-99',
              username: 'legacy_user',
            }),
          } as unknown as Response
        }
        return { ok: false, status: 404 } as unknown as Response
      })

      const res = await probeLocalGameNode(mockFetcher as unknown as typeof fetch, 8090)
      expect(res).toEqual({
        serverName: 'Otix Game Server',
        localUrl: 'http://127.0.0.1:8090',
        authToken: '',
        claimCode: 'CODE-CLAIM-99',
        claimed: false,
        claimedBy: 'legacy_user',
      })
      expect(unhandledRejections).toEqual([])
    })

    it('extracts auth token from HTML with node-access-token input or TOKEN constant', async () => {
      const mockFetcherWithInput = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/v1/status')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ server_name: 'Token Node', claimed: true }),
          } as unknown as Response
        }
        if (urlStr.endsWith(':8090/')) {
          return {
            ok: true,
            status: 200,
            text: async () => '<html><body><input id="node-access-token" value="tok_input_12345" /></body></html>',
          } as unknown as Response
        }
        return { ok: false, status: 404 } as unknown as Response
      })

      const res1 = await probeLocalGameNode(mockFetcherWithInput as unknown as typeof fetch, 8090)
      expect(res1?.authToken).toBe('tok_input_12345')

      const mockFetcherWithConst = vi.fn().mockImplementation(async (url: string) => {
        const urlStr = String(url)
        if (urlStr.includes('/api/v1/status')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ server_name: 'Token Node', claimed: true }),
          } as unknown as Response
        }
        if (urlStr.endsWith(':8090/')) {
          return {
            ok: true,
            status: 200,
            text: async () => '<script>const TOKEN = "tok_const_67890";</script>',
          } as unknown as Response
        }
        return { ok: false, status: 404 } as unknown as Response
      })

      const res2 = await probeLocalGameNode(mockFetcherWithConst as unknown as typeof fetch, 8090)
      expect(res2?.authToken).toBe('tok_const_67890')
    })

    it('handles aborted / timed-out network calls gracefully without rejection', async () => {
      const mockTimeoutFetch = vi.fn().mockImplementation(() => {
        const err = new Error('The operation was aborted due to timeout')
        err.name = 'TimeoutError'
        return Promise.reject(err)
      })

      const res = await probeLocalGameNode(mockTimeoutFetch as unknown as typeof fetch, 8090)
      expect(res).toBeNull()
      expect(unhandledRejections).toEqual([])
    })

    it('unclaimLocalGameNode handles custom ports, offline daemon, and failures gracefully', async () => {
      const mockOfflineFetch = vi.fn().mockRejectedValue(new Error('Connection refused'))
      const unclaimOffline = await unclaimLocalGameNode(mockOfflineFetch as unknown as typeof fetch, 'tok', 8110)
      expect(unclaimOffline).toBe(false)

      const mockSuccessFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      } as unknown as Response)
      const unclaimSuccess = await unclaimLocalGameNode(mockSuccessFetch as unknown as typeof fetch, 'my_tok', 8110)
      expect(unclaimSuccess).toBe(true)
      expect(mockSuccessFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:8110/api/v1/claim/unclaim?token=my_tok',
        expect.objectContaining({ method: 'POST' }),
      )
      expect(unhandledRejections).toEqual([])
    })
  })
})
