import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeatureGuideModal } from '../components/organisms/feature-guide-modal'
import { WELCOME_FEATURES } from '../constants/welcome-features'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

describe('FeatureGuideModal', () => {
  const feature = WELCOME_FEATURES[0] // Discover feature
  const onClose = vi.fn()
  const onNext = vi.fn()
  const onPrevious = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders feature title, tagline, description, and highlights', () => {
    render(<FeatureGuideModal feature={feature} onClose={onClose} />)

    expect(screen.getByText(feature.title)).toBeInTheDocument()
    expect(screen.getByText(feature.tagline)).toBeInTheDocument()
    expect(screen.getByText(feature.fullDescription)).toBeInTheDocument()

    feature.highlights.forEach((h) => {
      expect(screen.getByText(h.title)).toBeInTheDocument()
      expect(screen.getByText(h.description)).toBeInTheDocument()
    })
  })

  it('renders tour step pagination when provided', () => {
    render(
      <FeatureGuideModal
        feature={feature}
        currentIndex={0}
        totalFeatures={6}
        onNext={onNext}
        onPrevious={onPrevious}
        onClose={onClose}
      />,
    )

    expect(screen.getByText('1 of 6')).toBeInTheDocument()

    const nextBtn = screen.getByRole('button', { name: /next/i })
    expect(nextBtn).toBeInTheDocument()
    fireEvent.click(nextBtn)
    expect(onNext).toHaveBeenCalledTimes(1)

    const prevBtn = screen.getByRole('button', { name: /previous/i })
    expect(prevBtn).toBeDisabled()
  })

  it('calls onClose when close button is clicked', () => {
    render(<FeatureGuideModal feature={feature} onClose={onClose} />)

    const closeBtn = screen.getByRole('button', { name: /^close$/i })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
