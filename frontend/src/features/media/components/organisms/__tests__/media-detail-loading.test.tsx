import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MediaDetailLoading } from '../media-detail-loading'

let mockIsDesktop = false
vi.mock('@/lib/desktop/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/desktop/platform')>()
  return {
    ...actual,
    useDesktopPlatform: () => ({ isDesktop: mockIsDesktop }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ mediaType: 'movie', mediaId: '42' }),
}))

vi.mock('../../../hooks/use-media-params', () => ({
  useMediaParams: () => ({ mediaType: 'movie', mediaId: '42' }),
}))

const mockPreviewData = {
  title: 'Test Movie',
  logoUrl: 'https://example.com/logo.png',
  logoColorGuess: 'guess_white',
  backdropUrl: 'https://example.com/backdrop.jpg',
  posterUrl: 'https://example.com/poster.jpg',
}

let mockPreviewResult: typeof mockPreviewData | null = mockPreviewData

vi.mock('../../../hooks/use-media-preview', () => ({
  useMediaPreview: () => mockPreviewResult,
}))

describe('MediaDetailLoading', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    mockIsDesktop = false
    mockPreviewResult = mockPreviewData
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  const renderComponent = (props = {}) =>
    render(
      <QueryClientProvider client={queryClient}>
        <MediaDetailLoading {...props} />
      </QueryClientProvider>,
    )

  it('renders the media logo with breathing and glow animations', () => {
    renderComponent()

    const logo = screen.getByRole('img', { name: 'Test Movie' })
    expect(logo).toBeInTheDocument()
    expect(logo).toHaveAttribute('src', 'https://example.com/logo.png')

    const breatheContainer = logo.closest('.animate-media-logo-breathe')
    expect(breatheContainer).toBeInTheDocument()

    const glowElement = document.querySelector('.animate-media-logo-glow')
    expect(glowElement).toBeInTheDocument()

    const progressBar = screen.getByRole('progressbar', { name: 'Loading media detail' })
    expect(progressBar).toBeInTheDocument()
    expect(progressBar.querySelector('.animate-media-loading-sweep')).toBeInTheDocument()
  })

  it('falls back to title text when logo image fails to load', () => {
    renderComponent()

    const logo = screen.getByRole('img', { name: 'Test Movie' })
    fireEvent.error(logo)

    expect(screen.queryByRole('img', { name: 'Test Movie' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Test Movie' })).toBeInTheDocument()
  })

  it('renders title heading directly if no logo is available', () => {
    mockPreviewResult = {
      title: 'Logo-less Masterpiece',
      logoUrl: null,
      logoColorGuess: null,
      backdropUrl: 'https://example.com/backdrop.jpg',
      posterUrl: null,
    }

    renderComponent()

    expect(screen.getByRole('heading', { level: 1, name: 'Logo-less Masterpiece' })).toBeInTheDocument()
  })

  it('renders Otix logo mark if neither logo nor title is known', () => {
    mockPreviewResult = null

    renderComponent()

    expect(document.querySelector('.dk-logo--animate-infinity')).toBeInTheDocument()
  })

  it('applies title bar offset when on desktop platform', () => {
    mockIsDesktop = true

    renderComponent()

    const container = document.getElementById('media-detail-loading')
    expect(container).toHaveClass('pt-[var(--title-bar-height,38px)]')
  })
})
