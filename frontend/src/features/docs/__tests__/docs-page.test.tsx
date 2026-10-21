import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { DocsPage } from '../pages/docs-page'

const mockNavigate = vi.fn()
let mockSearchParams: Record<string, unknown> = {}

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearch: () => mockSearchParams,
    Link: ({ children, to, className }: { children: React.ReactNode; to: string; className?: string }) => (
      <a href={to} className={className}>
        {children}
      </a>
    ),
  }
})

const mockToast = vi.fn()
vi.mock('@ui/molecules/toast', () => ({
  useToast: () => ({ toast: mockToast }),
  DkToastProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  showErrorToast: vi.fn(),
}))

vi.mock('@/lib/desktop/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/desktop/api')>()
  return {
    ...actual,
    isDesktop: () => false,
    getDesktopAPI: () => null,
  }
})

describe('DocsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchParams = {}
    window.scrollTo = vi.fn()
    global.IntersectionObserver = class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    } as unknown as typeof IntersectionObserver
  })

  const renderComponent = () =>
    render(
      <HelmetProvider>
        <DocsPage />
      </HelmetProvider>,
    )

  it('renders default Overview article and categories', () => {
    renderComponent()

    expect(screen.getByRole('heading', { level: 1, name: /overview & ecosystem/i })).toBeInTheDocument()
    expect(screen.getAllByText(/getting started/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/architecture & concepts/i).length).toBeGreaterThan(0)
  })

  it('switches article when clicking sidebar navigation item', () => {
    renderComponent()

    const installButtons = screen.getAllByRole('button', { name: /installation/i })
    fireEvent.click(installButtons[0])

    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/docs',
      search: expect.any(Function),
    })
  })

  it('filters articles dynamically when typing in search input', () => {
    renderComponent()

    const searchInput = screen.getAllByPlaceholderText(/filter documentation/i)[0]
    fireEvent.change(searchInput, { target: { value: 'Plex' } })

    expect(screen.getByText(/search results/i)).toBeInTheDocument()
    expect(screen.getAllByText(/media streaming & playback/i).length).toBeGreaterThan(0)
  })

  it('displays code snippets and calls toast on copy', async () => {
    mockSearchParams = { section: 'installation' }
    const originalClipboard = navigator.clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    })

    renderComponent()

    // Find copy buttons
    const copyButtons = screen.getAllByRole('button', { name: /copy/i })
    expect(copyButtons.length).toBeGreaterThan(0)

    await act(async () => {
      fireEvent.click(copyButtons[0])
    })

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Copied to Clipboard',
        variant: 'success',
      }),
    )

    Object.assign(navigator, { clipboard: originalClipboard })
  })

  it('renders table of contents for on-this-page navigation', () => {
    renderComponent()

    expect(screen.getByRole('complementary', { name: /table of contents/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /welcome to otix/i })).toBeInTheDocument()
  })

  it('renders next article pagination button', () => {
    renderComponent()

    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeInTheDocument()

    fireEvent.click(nextBtn)
    expect(mockNavigate).toHaveBeenCalled()
  })
})
