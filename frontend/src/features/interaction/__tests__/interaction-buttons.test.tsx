import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockOpenModal = vi.fn()
let mockIsAuthenticated = true

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}))

vi.mock('@auth/hooks/use-auth', () => ({
  useAuth: () => ({ isAuthenticated: mockIsAuthenticated }),
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({ openModal: mockOpenModal }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: any) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ href: '/media/show/123' }),
}))

vi.mock('@ui/atoms/xp-toast', () => ({
  showXPToast: vi.fn(),
}))

import { InteractionSection } from '../molecules/interaction-buttons'

const createWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: React.ReactNode }) =>
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('InteractionSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsAuthenticated = true
  })

  it('renders the Watched button for a movie', () => {
    render(
      <InteractionSection mediaId="movie-123" mediaType="movie" />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('Watched')).toBeInTheDocument()
    expect(screen.getByText('Like')).toBeInTheDocument()
  })

  it('renders the Watchlist button for shows', () => {
    render(
      <InteractionSection mediaId="show-123" mediaType="show" />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('Watchlist')).toBeInTheDocument()
  })

  it('opens sign-in modal when clicking interaction button while not authenticated', async () => {
    mockIsAuthenticated = false

    render(
      <InteractionSection mediaId="movie-123" mediaType="movie" />,
      { wrapper: createWrapper() },
    )

    expect(screen.getByText('Like')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Like'))
    expect(mockOpenModal).toHaveBeenCalled()
  })

  it('does not open a confirmation dialog when clicking Watched for a movie', async () => {
    render(
      <InteractionSection mediaId="movie-123" mediaType="movie" />,
      { wrapper: createWrapper() },
    )

    await userEvent.click(screen.getByText('Watched'))
    expect(mockOpenModal).not.toHaveBeenCalled()
  })
})
