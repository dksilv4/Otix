import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@auth'
import type { ReactNode } from 'react'

// ── Mocks (vi.hoisted so factory can reference them before declaration order) ──

const { mockPost, mockGet } = vi.hoisted(() => ({
  mockPost: vi.fn(),
  mockGet: vi.fn(),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: { post: mockPost, get: mockGet },
}))

vi.mock('@/lib/query/client', () => ({
  queryClient: {
    clear: vi.fn(),
    invalidateQueries: vi.fn(),
  },
}))

// ── Helpers ─────────────────────────────────────────────────────────────

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  username: 'testuser',
  isVerified: true,
  twoFactorEnabled: false,
}

const mockLoginResponse = {
  accessToken: 'test-access-token',
  twoFactorRequired: false,
  challengeToken: null,
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('auth session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('starts unauthenticated when no token is stored', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('login stores token and exposes user', async () => {
    mockPost.mockResolvedValueOnce({ data: mockLoginResponse })
    mockGet.mockResolvedValueOnce({ data: mockUser })
    mockGet.mockResolvedValueOnce({ data: {} }) // mergeIntegrations

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      const res = await result.current.login('test@example.com', 'password123')
      expect(res.accessToken).toBe('test-access-token')
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(mockUser)
    expect(mockGet).toHaveBeenCalledWith('/auth/me')
    expect(mockGet).toHaveBeenCalledWith('/auth/me/integrations')
    expect(mockPost).toHaveBeenCalledWith('/auth/login', {
      identity: 'test@example.com',
      password: 'password123',
    })
    expect(localStorage.getItem('otix-access-token')).toBe('test-access-token')
  })

  it('logout clears token and user state', async () => {
    // Login first
    mockPost.mockResolvedValueOnce({ data: mockLoginResponse })
    mockGet.mockResolvedValueOnce({ data: mockUser })
    mockGet.mockResolvedValueOnce({ data: {} })

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.login('test@example.com', 'password123')
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(localStorage.getItem('otix-access-token')).toBe('test-access-token')

    // Logout
    mockPost.mockResolvedValueOnce({ data: {} })
    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('otix-access-token')).toBeNull()
    expect(mockPost).toHaveBeenCalledWith('/auth/logout')
  })

  it('handles token refresh failure via auth:sessionExpired event', async () => {
    // Login first
    mockPost.mockResolvedValueOnce({ data: mockLoginResponse })
    mockGet.mockResolvedValueOnce({ data: mockUser })
    mockGet.mockResolvedValueOnce({ data: {} })

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.login('test@example.com', 'password123')
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toBeDefined()

    // Simulate token refresh failure — API client fires this when refresh fails
    await act(async () => {
      window.dispatchEvent(new CustomEvent('auth:sessionExpired'))
    })

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(localStorage.getItem('otix-access-token')).toBeNull()

    const { queryClient } = await import('@/lib/query/client')
    expect(queryClient.clear).toHaveBeenCalled()
  })

  it('completeLogin sets token, loads user and sets isAuthenticated to true', async () => {
    mockGet.mockResolvedValueOnce({ data: mockUser })
    mockGet.mockResolvedValueOnce({ data: {} }) // mergeIntegrations

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isAuthenticated).toBe(false)

    await act(async () => {
      const loaded = await result.current.completeLogin('oauth-access-token')
      expect(loaded).toEqual(mockUser)
    })

    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.user).toEqual(mockUser)
    expect(localStorage.getItem('otix-access-token')).toBe('oauth-access-token')
    expect(mockGet).toHaveBeenCalledWith('/auth/me')
  })
})
