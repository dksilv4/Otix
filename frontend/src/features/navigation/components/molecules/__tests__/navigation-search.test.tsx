import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NavSearch } from '../navigation-search'
import { apiClient } from '@/lib/api/client'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: '/discover' }),
  Link: ({
    to,
    children,
    onClick,
    className,
  }: {
    to: string
    children: React.ReactNode
    onClick?: () => void
    className?: string
  }) => (
    <a href={to} onClick={onClick} className={className}>
      {children}
    </a>
  ),
}))

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

describe('NavSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders closed state with search trigger button', () => {
    render(<NavSearch />)
    const trigger = screen.getByRole('button', { name: /search/i })
    expect(trigger).toBeInTheDocument()
  })

  it('expands input when trigger button is clicked', () => {
    render(<NavSearch />)
    const trigger = screen.getByRole('button', { name: /search/i })
    fireEvent.click(trigger)

    const input = screen.getByPlaceholderText('Search...')
    expect(input).toBeInTheDocument()
  })

  it('fetches and displays suggestions after typing', async () => {
    const mockSuggestions = [
      {
        id: '123',
        mediaType: 'movie',
        title: 'Inception',
        releaseDate: '2010-07-15',
        posterUrl: 'https://example.com/poster.jpg',
      },
      {
        id: '456',
        mediaType: 'game',
        title: 'Cyberpunk 2077',
        releaseDate: '2020-12-10',
        posterUrl: null,
      },
    ]

    vi.mocked(apiClient.get).mockResolvedValueOnce({ data: mockSuggestions })

    render(<NavSearch />)
    const trigger = screen.getByRole('button', { name: /search/i })
    fireEvent.click(trigger)

    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'Incep' } })

    await waitFor(
      () => {
        expect(apiClient.get).toHaveBeenCalledWith('/search/suggestions', expect.objectContaining({
          params: expect.objectContaining({ q: 'Incep', limit: 8 }),
        }))
      },
      { timeout: 1000 }
    )

    await waitFor(() => {
      expect(screen.getByText('Inception')).toBeInTheDocument()
      expect(screen.getByText('Cyberpunk 2077')).toBeInTheDocument()
    })
  })

  it('collapses on Escape key press', () => {
    render(<NavSearch />)
    const trigger = screen.getByRole('button', { name: /search/i })
    fireEvent.click(trigger)

    const input = screen.getByPlaceholderText('Search...')
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument()
  })
})
