import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { CallbackPage } from '../pages/auth-callback-page'

const mockNavigate = vi.fn()
let mockParams: Record<string, string> = { service: 'google-login' }

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
}))

const mockCompleteLogin = vi.fn().mockResolvedValue(null)
const mockAuth = {
  completeLogin: mockCompleteLogin,
  isAuthenticated: false,
}

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => mockAuth,
}))

const mockPost = vi.fn()
vi.mock('@/lib/api/client', () => ({
  apiClient: { post: (...args: any[]) => mockPost(...args) },
}))

vi.mock('@auth/components/atoms/auth-background', () => ({
  AuthBackground: () => <div data-testid="auth-bg" />,
}))

vi.mock('@auth/components/molecules/auth-card', () => ({
  AuthCard: ({ children }: { children: React.ReactNode }) => <div data-testid="auth-card">{children}</div>,
}))

describe('CallbackPage', () => {
  const originalLocation = window.location

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    delete (window as any).location
    window.location = {
      ...originalLocation,
      search: '?code=test-code&state=test-state',
      href: '',
    } as any
  })

  afterEach(() => {
    window.location = originalLocation
  })

  it('completes login in AuthProvider and navigates into app on web OAuth login', async () => {
    mockParams = { service: 'google-login' }
    mockPost.mockResolvedValueOnce({
      data: { accessToken: 'oauth-jwt-token' },
    })

    render(
      <HelmetProvider>
        <CallbackPage />
      </HelmetProvider>,
    )

    await waitFor(() => {
      expect(mockCompleteLogin).toHaveBeenCalledWith('oauth-jwt-token')
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/', replace: true })
    })

    // Should NOT show "Close this tab and return to Otix" for web login
    expect(screen.queryByText(/Close this tab and return to Otix/i)).toBeNull()
  })

  it('navigates to redirect param when provided on web OAuth login', async () => {
    mockParams = { service: 'google-login' }
    window.location.search = '?code=test-code&state=test-state&redirect=/settings'
    mockPost.mockResolvedValueOnce({
      data: { accessToken: 'oauth-jwt-token' },
    })

    render(
      <HelmetProvider>
        <CallbackPage />
      </HelmetProvider>,
    )

    await waitFor(() => {
      expect(mockCompleteLogin).toHaveBeenCalledWith('oauth-jwt-token')
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings', replace: true })
    })
  })

  it('handles desktop login by launching otix:// scheme and showing close tab hint', async () => {
    mockParams = { service: 'google-login' }
    window.location.search = '?code=test-code&state=test-state&source=desktop'
    mockPost.mockResolvedValueOnce({
      data: { accessToken: 'oauth-jwt-token', source: 'desktop' },
    })

    render(
      <HelmetProvider>
        <CallbackPage />
      </HelmetProvider>,
    )

    await waitFor(() => {
      expect(window.location.href).toContain('otix://auth/callback/google-login?success=true&accessToken=')
    })

    expect(await screen.findByText(/You can close this tab and return to Otix/i)).toBeDefined()
  })

  it('handles link flow without showing close tab hint on web', async () => {
    mockParams = { service: 'plex' }
    window.location.search = '?state=test-state&pinId=123'
    mockPost.mockResolvedValueOnce({
      data: { message: 'Plex account linked successfully' },
    })

    render(
      <HelmetProvider>
        <CallbackPage />
      </HelmetProvider>,
    )

    expect(await screen.findByText(/Your Plex account has been linked successfully/i)).toBeDefined()
    expect(screen.queryByText(/Close this tab and return to Otix/i)).toBeNull()

    await waitFor(
      () => {
        expect(mockNavigate).toHaveBeenCalledWith({ to: '/settings/connections', replace: true })
      },
      { timeout: 2000 },
    )
  })

  it('offers Back to Sign In button on login failure', async () => {
    mockParams = { service: 'google-login' }
    mockPost.mockRejectedValueOnce({
      response: { data: { detail: 'Google authorization failed.' } },
    })

    render(
      <HelmetProvider>
        <CallbackPage />
      </HelmetProvider>,
    )

    expect(await screen.findByText(/Google authorization failed/i)).toBeDefined()
    const backBtn = screen.getByRole('button', { name: /Back to Sign In/i })
    expect(backBtn).toBeDefined()

    fireEvent.click(backBtn)
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/auth/login', replace: true })
  })
})
