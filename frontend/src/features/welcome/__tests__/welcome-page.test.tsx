import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { WelcomePage } from '../pages/welcome-page'
import { WELCOME_FEATURES } from '../constants/welcome-features'

const mockOpenModal = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@/lib/modals', () => ({
  useModal: () => ({
    openModal: mockOpenModal,
    closeModal: vi.fn(),
    closeAll: vi.fn(),
    modals: [],
  }),
}))

vi.mock('@/features/auth/hooks/use-auth', () => ({
  useAuth: () => ({
    user: { id: '1', username: 'testuser', onboardingCompleted: false },
    isAuthenticated: true,
    refreshUser: vi.fn(),
  }),
}))

vi.mock('@/lib/router', () => ({
  router: {
    navigate: vi.fn(),
  },
}))

describe('WelcomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  const renderComponent = () =>
    render(
      <HelmetProvider>
        <WelcomePage />
      </HelmetProvider>,
    )

  it('renders hero title, feature grid, and visibility controls', () => {
    renderComponent()

    expect(screen.getByRole('heading', { level: 1, name: /welcome to otix/i })).toBeInTheDocument()
    expect(screen.getByText(/explore the otix ecosystem/i)).toBeInTheDocument()

    // All features should have their cards present
    WELCOME_FEATURES.forEach((feature) => {
      expect(screen.getByText(feature.title)).toBeInTheDocument()
    })

    // Visibility controls section
    expect(screen.getByText(/guide visibility & navigation/i)).toBeInTheDocument()
  })

  it('opens FeatureGuideModal when clicking Start Feature Tour', () => {
    renderComponent()

    const tourBtn = screen.getByRole('button', { name: /start feature tour/i })
    fireEvent.click(tourBtn)

    expect(mockOpenModal).toHaveBeenCalledTimes(1)
  })

  it('opens FeatureGuideModal when clicking What does this do? on a feature card', () => {
    renderComponent()

    const cardButtons = screen.getAllByRole('button', { name: /what does this do\?/i })
    expect(cardButtons.length).toBe(WELCOME_FEATURES.length)

    fireEvent.click(cardButtons[0])
    expect(mockOpenModal).toHaveBeenCalledTimes(1)
  })
})
