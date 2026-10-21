import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FeatureSpotlightTeaser } from '../components/molecules/feature-spotlight-teaser'
import { FEATURE_TIPS } from '../constants/feature-tips'

describe('FeatureSpotlightTeaser', () => {
  const tip = FEATURE_TIPS[0]
  const onOpenTip = vi.fn()
  const onDismiss = vi.fn()

  it('renders nothing when not visible or tip is null', () => {
    const { container: c1 } = render(
      <FeatureSpotlightTeaser tip={null} isVisible={true} onOpenTip={onOpenTip} onDismiss={onDismiss} />,
    )
    expect(c1).toBeEmptyDOMElement()

    const { container: c2 } = render(
      <FeatureSpotlightTeaser tip={tip} isVisible={false} onOpenTip={onOpenTip} onDismiss={onDismiss} />,
    )
    expect(c2).toBeEmptyDOMElement()
  })

  it('renders title, category, and responds to click and dismiss', () => {
    render(
      <FeatureSpotlightTeaser tip={tip} isVisible={true} onOpenTip={onOpenTip} onDismiss={onDismiss} />,
    )

    expect(screen.getByText(tip.title)).toBeInTheDocument()
    expect(screen.getByText(tip.categoryLabel)).toBeInTheDocument()

    const viewBtn = screen.getByRole('button', { name: /view tip/i })
    fireEvent.click(viewBtn)
    expect(onOpenTip).toHaveBeenCalledWith(tip)

    const dismissBtn = screen.getByLabelText(/dismiss feature tip/i)
    fireEvent.click(dismissBtn)
    expect(onDismiss).toHaveBeenCalled()
  })
})
