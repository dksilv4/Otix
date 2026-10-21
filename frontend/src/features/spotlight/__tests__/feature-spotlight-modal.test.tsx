import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeatureSpotlightModal } from '../components/organisms/feature-spotlight-modal'
import { FEATURE_TIPS } from '../constants/feature-tips'

const mockNavigate = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/features/discover/open-decide-watch', () => ({
  openDecideWatch: vi.fn(),
}))

vi.mock('@/features/hub/open-command-palette', () => ({
  openCommandPalette: vi.fn(),
}))

describe('FeatureSpotlightModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  it('renders tip details, category, and indicator', () => {
    const tip = FEATURE_TIPS[0]
    render(<FeatureSpotlightModal initialTipId={tip.id} onClose={onClose} />)

    expect(screen.getByText(tip.title)).toBeInTheDocument()
    expect(screen.getByText(tip.categoryLabel)).toBeInTheDocument()
    expect(screen.getByText(tip.description)).toBeInTheDocument()
    expect(screen.getByText(`Tip 1 of ${FEATURE_TIPS.length}`)).toBeInTheDocument()
  })

  it('cycles to next and previous tips on button clicks', () => {
    render(<FeatureSpotlightModal initialTipId={FEATURE_TIPS[0].id} onClose={onClose} />)

    const nextBtn = screen.getByRole('button', { name: /next/i })
    fireEvent.click(nextBtn)

    expect(screen.getByText(FEATURE_TIPS[1].title)).toBeInTheDocument()
    expect(screen.getByText(`Tip 2 of ${FEATURE_TIPS.length}`)).toBeInTheDocument()

    const prevBtn = screen.getByRole('button', { name: /previous/i })
    fireEvent.click(prevBtn)

    expect(screen.getByText(FEATURE_TIPS[0].title)).toBeInTheDocument()
  })

  it('executes action on primary button click and calls onClose', () => {
    const tip = FEATURE_TIPS[2] // game tracking -> /launcher navigate
    render(<FeatureSpotlightModal initialTipId={tip.id} onClose={onClose} />)

    const actionBtn = screen.getByRole('button', { name: new RegExp(tip.actionLabel!, 'i') })
    fireEvent.click(actionBtn)

    expect(mockNavigate).toHaveBeenCalledWith({ to: tip.actionPayload })
    expect(onClose).toHaveBeenCalled()
  })

  it('toggles automatic suggestions', () => {
    render(<FeatureSpotlightModal initialTipId={FEATURE_TIPS[0].id} onClose={onClose} />)

    const toggle = screen.getByRole('switch', { name: /auto-suggestions/i })
    expect(toggle).toBeChecked()

    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
  })
})
