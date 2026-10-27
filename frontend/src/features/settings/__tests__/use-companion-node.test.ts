import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { clearDesktopAPICache, type NodeDaemonStatus } from '@/lib/desktop/api'
import { useCompanionNode } from '../hooks/use-companion-node'
import { probeLocalGameNode } from '@/features/downloads/pending-nodes'
import { SettingsNodeProvider, useSettingsNode } from '../context/settings-node-context'
import { createElement, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

describe('useCompanionNode', () => {
  let mockStatusChangedHandler: ((status: NodeDaemonStatus) => void) | null = null
  let mockUnsubscribe: ReturnType<typeof vi.fn>

  beforeEach(() => {
    clearDesktopAPICache()
    delete (window as unknown as { desktopAPI?: unknown }).desktopAPI
    mockStatusChangedHandler = null
    mockUnsubscribe = vi.fn()
  })

  afterEach(() => {
    clearDesktopAPICache()
    delete (window as unknown as { desktopAPI?: unknown }).desktopAPI
  })

  it('provides default inactive state in browser environment', async () => {
    const { result } = renderHook(() => useCompanionNode())

    expect(result.current.status).toBeNull()
    expect(result.current.isRunning).toBe(false)
    expect(result.current.isStarting).toBe(false)
    expect(result.current.port).toBe(8090)
    expect(result.current.error).toBeNull()
    expect(result.current.version).toBeNull()

    await expect(result.current.start(8090)).resolves.toBeNull()
    await expect(result.current.stop()).resolves.toBeNull()
    await expect(result.current.restart(8090)).resolves.toBeNull()
  })

  it('polls daemon status on mount when desktopAPI is present', async () => {
    const mockStatus: NodeDaemonStatus = {
      running: true,
      embedded: true,
      port: 8092,
      url: 'http://127.0.0.1:8092',
      version: '1.2.0',
    }

    const getStatus = vi.fn().mockResolvedValue(mockStatus)
    const onStatusChanged = vi.fn().mockReturnValue(mockUnsubscribe)

    ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
      nodeDaemon: {
        getStatus,
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(),
        onStatusChanged,
      },
    }
    clearDesktopAPICache()

    const { result } = renderHook(() => useCompanionNode())

    expect(getStatus).toHaveBeenCalledTimes(1)
    expect(onStatusChanged).toHaveBeenCalledTimes(1)

    await waitFor(() => {
      expect(result.current.isRunning).toBe(true)
      expect(result.current.port).toBe(8092)
      expect(result.current.version).toBe('1.2.0')
      expect(result.current.status).toEqual(mockStatus)
    })
  })

  it('subscribes to onStatusChanged and unsubscribes on unmount', async () => {
    const getStatus = vi.fn().mockResolvedValue({
      running: false,
      embedded: true,
      port: 8090,
      url: 'http://127.0.0.1:8090',
    })

    const onStatusChanged = vi.fn().mockImplementation((cb: (status: NodeDaemonStatus) => void) => {
      mockStatusChangedHandler = cb
      return mockUnsubscribe
    })

    ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
      nodeDaemon: {
        getStatus,
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(),
        onStatusChanged,
      },
    }
    clearDesktopAPICache()

    const { result, unmount } = renderHook(() => useCompanionNode())

    await waitFor(() => {
      expect(onStatusChanged).toHaveBeenCalled()
      expect(mockStatusChangedHandler).not.toBeNull()
    })

    // Simulate daemon transition to starting
    act(() => {
      mockStatusChangedHandler?.({
        running: false,
        starting: true,
        embedded: true,
        port: 8090,
        url: 'http://127.0.0.1:8090',
      } as unknown as NodeDaemonStatus)
    })

    expect(result.current.isStarting).toBe(true)
    expect(result.current.isRunning).toBe(false)

    // Simulate daemon transition to running
    act(() => {
      mockStatusChangedHandler?.({
        running: true,
        starting: false,
        embedded: true,
        port: 8090,
        url: 'http://127.0.0.1:8090',
        version: '1.0.0',
      } as unknown as NodeDaemonStatus)
    })

    expect(result.current.isRunning).toBe(true)
    expect(result.current.isStarting).toBe(false)

    // Unmount and verify unsubscribe was called
    unmount()
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1)
  })

  it('propagates dynamic port and triggers onStatusChanged callback', async () => {
    const statusCallback = vi.fn()
    const getStatus = vi.fn().mockResolvedValue({
      running: false,
      embedded: true,
      port: 8090,
      url: 'http://127.0.0.1:8090',
    })

    const onStatusChanged = vi.fn().mockImplementation((cb: (status: NodeDaemonStatus) => void) => {
      mockStatusChangedHandler = cb
      return mockUnsubscribe
    })

    ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
      nodeDaemon: {
        getStatus,
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(),
        onStatusChanged,
      },
    }
    clearDesktopAPICache()

    const { result } = renderHook(() => useCompanionNode({ onStatusChanged: statusCallback }))

    await waitFor(() => {
      expect(statusCallback).toHaveBeenCalled()
    })

    // Daemon allocates dynamic port 8115 upon startup
    act(() => {
      mockStatusChangedHandler?.({
        running: true,
        embedded: true,
        port: 8115,
        url: 'http://127.0.0.1:8115',
        version: '1.5.0',
      })
    })

    expect(result.current.port).toBe(8115)
    expect(result.current.isRunning).toBe(true)
    expect(statusCallback).toHaveBeenLastCalledWith(
      expect.objectContaining({
        port: 8115,
        running: true,
      }),
    )
  })

  it('delegates start, stop, and restart controls to desktopAPI', async () => {
    const startedStatus: NodeDaemonStatus = {
      running: true,
      embedded: true,
      port: 8095,
      url: 'http://127.0.0.1:8095',
    }
    const stoppedStatus: NodeDaemonStatus = {
      running: false,
      embedded: true,
      port: 8095,
      url: 'http://127.0.0.1:8095',
    }
    const restartedStatus: NodeDaemonStatus = {
      running: true,
      embedded: true,
      port: 8099,
      url: 'http://127.0.0.1:8099',
    }

    const startMock = vi.fn().mockResolvedValue(startedStatus)
    const stopMock = vi.fn().mockResolvedValue(stoppedStatus)
    const restartMock = vi.fn().mockResolvedValue(restartedStatus)

    ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
      nodeDaemon: {
        getStatus: vi.fn().mockResolvedValue(stoppedStatus),
        start: startMock,
        stop: stopMock,
        restart: restartMock,
        onStatusChanged: vi.fn().mockReturnValue(mockUnsubscribe),
      },
    }
    clearDesktopAPICache()

    const { result } = renderHook(() => useCompanionNode())

    await act(async () => {
      const res = await result.current.start(8095)
      expect(res).toEqual(startedStatus)
    })
    expect(startMock).toHaveBeenCalledWith(8095)
    expect(result.current.isRunning).toBe(true)
    expect(result.current.port).toBe(8095)

    await act(async () => {
      const res = await result.current.stop()
      expect(res).toEqual(stoppedStatus)
    })
    expect(stopMock).toHaveBeenCalledTimes(1)
    expect(result.current.isRunning).toBe(false)

    await act(async () => {
      const res = await result.current.restart(8099)
      expect(res).toEqual(restartedStatus)
    })
    expect(restartMock).toHaveBeenCalledWith(8099)
    expect(result.current.isRunning).toBe(true)
    expect(result.current.port).toBe(8099)
  })

  it('dispatches companion-node-running event on window when daemon transitions to running', async () => {
    const runningEventListener = vi.fn()
    window.addEventListener('companion-node-running', runningEventListener)

    const onStatusChanged = vi.fn().mockImplementation((cb: (status: NodeDaemonStatus) => void) => {
      mockStatusChangedHandler = cb
      return mockUnsubscribe
    })

    ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
      nodeDaemon: {
        getStatus: vi.fn().mockResolvedValue({
          running: false,
          embedded: true,
          port: 8090,
          url: 'http://127.0.0.1:8090',
        }),
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(),
        onStatusChanged,
      },
    }
    clearDesktopAPICache()

    renderHook(() => useCompanionNode())

    await waitFor(() => {
      expect(mockStatusChangedHandler).not.toBeNull()
    })

    act(() => {
      mockStatusChangedHandler?.({
        running: true,
        embedded: true,
        port: 8120,
        url: 'http://127.0.0.1:8120',
      })
    })

    expect(runningEventListener).toHaveBeenCalled()
    const customEvent = runningEventListener.mock.calls[0][0] as CustomEvent
    expect(customEvent.detail.port).toBe(8120)

    window.removeEventListener('companion-node-running', runningEventListener)
  })

  it('supports dynamic port in probeLocalGameNode', async () => {
    const mockFetcher = vi.fn(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('8125/api/v1/status')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            server_name: 'Dynamic Companion Node',
            claim_code: 'CLAIM123',
            claimed: true,
            claimed_by: 'testuser',
          }),
        } as unknown as Response
      }
      return {
        ok: true,
        status: 200,
        text: async () => '<input id="node-access-token" value="secret_tok_8125" />',
      } as unknown as Response
    })

    const probed = await probeLocalGameNode(mockFetcher as unknown as typeof fetch, 8125)

    expect(mockFetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8125/api/v1/status',
      expect.anything(),
    )
    expect(probed).toEqual({
      serverName: 'Dynamic Companion Node',
      localUrl: 'http://127.0.0.1:8125',
      authToken: 'secret_tok_8125',
      claimCode: 'CLAIM123',
      claimed: true,
      claimedBy: 'testuser',
    })
  })

  it('immediately switches SettingsNodeProvider to companion node when daemon is running', async () => {
    ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
      platform: 'darwin',
      nodeDaemon: {
        getStatus: vi.fn().mockResolvedValue({
          running: true,
          embedded: true,
          port: 8090,
          url: 'http://127.0.0.1:8090',
        }),
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(),
        onStatusChanged: vi.fn().mockImplementation((cb: (status: NodeDaemonStatus) => void) => {
          mockStatusChangedHandler = cb
          return mockUnsubscribe
        }),
      },
    }
    clearDesktopAPICache()

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
      // In desktop environment with daemon running, selectedNode should immediately be the companion node
      expect(result.current.selectedNode).not.toBeNull()
      expect(result.current.selectedNode?.isLocalDesktop).toBe(true)
      expect(result.current.selectedNode?.id).toBe(-1)
    })
  })

  it('captures and updates daemon error state', async () => {
    const errorStatus: NodeDaemonStatus = {
      running: false,
      embedded: true,
      port: 8090,
      url: 'http://127.0.0.1:8090',
      error: 'Failed to bind port: EADDRINUSE',
    }

    const onStatusChanged = vi.fn().mockImplementation((cb: (status: NodeDaemonStatus) => void) => {
      mockStatusChangedHandler = cb
      return mockUnsubscribe
    })

    ;(window as unknown as { desktopAPI?: unknown }).desktopAPI = {
      nodeDaemon: {
        getStatus: vi.fn().mockResolvedValue({
          running: false,
          embedded: true,
          port: 8090,
          url: 'http://127.0.0.1:8090',
        }),
        start: vi.fn(),
        stop: vi.fn(),
        restart: vi.fn(),
        onStatusChanged,
      },
    }
    clearDesktopAPICache()

    const { result } = renderHook(() => useCompanionNode())

    await waitFor(() => {
      expect(mockStatusChangedHandler).not.toBeNull()
    })

    act(() => {
      mockStatusChangedHandler?.(errorStatus)
    })

    expect(result.current.error).toBe('Failed to bind port: EADDRINUSE')
    expect(result.current.isRunning).toBe(false)
  })
})

