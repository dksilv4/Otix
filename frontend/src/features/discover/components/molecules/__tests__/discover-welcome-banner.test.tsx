import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiscoverWelcomeBanner } from '../discover-welcome-banner'

const mockSetWelcomeBannerVisible = vi.fn()

vi.mock('@/features/welcome/hooks/use-welcome-preferences', () => ({
  useWelcomePreferences: () => ({
    isWelcomeBannerVisible: true,
    setWelcomeBannerVisible: mockSetWelcomeBannerVisible,
  }),
}))

vi.mock('@/lib/router', () => ({
  router: {
    navigate: vi.fn(),
  },
}))

describe('DiscoverWelcomeBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders welcome greeting and CTA buttons when visible', () => {
    render(<DiscoverWelcomeBanner />)

    expect(screen.getByRole('heading', { name: /welcome to otix/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /explore features/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^dismiss$/i })).toBeInTheDocument()
  })

  it('calls setWelcomeBannerVisible(false) when dismiss is clicked', () => {
    render(<DiscoverWelcomeBanner />)

    const dismissBtn = screen.getByRole('button', { name: /^dismiss$/i })
    fireEvent.click(dismissBtn)

    expect(mockSetWelcomeBannerVisible).toHaveBeenCalledWith(false)
  })
})
