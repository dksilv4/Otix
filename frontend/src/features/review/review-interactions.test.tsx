// TODO: Review this file
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InteractiveStar } from './atoms/interactive-star'
import { StarInput } from './molecules/star-input'
import { useSwipe } from './hooks/use-swipe'

describe('InteractiveStar', () => {
  it('emits half and full scores from the correct hit areas', () => {
    const onPointerDown = vi.fn()
    const { container } = render(
      <InteractiveStar
        starIndex={2}
        currentScore={0}
        hoveredScore={0}
        onPointerDown={onPointerDown}
        onPointerEnter={vi.fn()}
        onPointerMove={vi.fn()}
      />,
    )

    const hitAreas = container.querySelectorAll('span[style*="touch-action"]')
    fireEvent.pointerDown(hitAreas[0])
    fireEvent.pointerDown(hitAreas[1])

    expect(onPointerDown).toHaveBeenNthCalledWith(1, 5)
    expect(onPointerDown).toHaveBeenNthCalledWith(2, 6)
  })
})

describe('StarInput', () => {
  it('selects and toggles scores on tap', async () => {
    const onChange = vi.fn()
    const { container, rerender } = render(<StarInput value={null} onChange={onChange} />)
    const firstStarRightHalf = container.querySelectorAll('span[style*="touch-action"]')[1]

    fireEvent.pointerDown(firstStarRightHalf)
    fireEvent.pointerUp(container.firstElementChild as Element)
    expect(onChange).toHaveBeenCalledWith(2)

    rerender(<StarInput value={2} onChange={onChange} />)
    fireEvent.pointerDown(container.querySelectorAll('span[style*="touch-action"]')[1])
    fireEvent.pointerUp(container.firstElementChild as Element)
    expect(onChange).toHaveBeenCalledWith(0)
  })

  it('ignores input when disabled', async () => {
    const onChange = vi.fn()
    const { container } = render(<StarInput value={null} onChange={onChange} disabled />)

    fireEvent.pointerDown(container.querySelectorAll('span[style*="touch-action"]')[1])
    fireEvent.pointerUp(container.firstElementChild as Element)

    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('useSwipe', () => {
  const SwipeHarness = ({ onLeft = vi.fn(), onRight = vi.fn() }) => {
    const swipe = useSwipe({ threshold: 50, onSwipeLeft: onLeft, onSwipeRight: onRight })
    return (
      <div
        data-testid="swipe"
        data-x={swipe.translateX}
        data-direction={swipe.direction ?? ''}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        <button onClick={swipe.reset}>Reset</button>
      </div>
    )
  };

  it('snaps and calls callbacks when swipes pass the threshold', () => {
    const onLeft = vi.fn()
    render(<SwipeHarness onLeft={onLeft} />)
    const area = screen.getByTestId('swipe')

    fireEvent.touchStart(area, { touches: [{ clientX: 100 }] })
    fireEvent.touchMove(area, { touches: [{ clientX: 20 }] })
    expect(area).toHaveAttribute('data-direction', 'left')

    fireEvent.touchEnd(area)
    expect(onLeft).toHaveBeenCalledOnce()
    expect(area).toHaveAttribute('data-x', '-50')
  })

  it('resets when movement is below the threshold', async () => {
    render(<SwipeHarness />)
    const area = screen.getByTestId('swipe')

    fireEvent.touchStart(area, { touches: [{ clientX: 100 }] })
    fireEvent.touchMove(area, { touches: [{ clientX: 125 }] })
    fireEvent.touchEnd(area)
    expect(area).toHaveAttribute('data-x', '0')

    await userEvent.click(screen.getByText('Reset'))
    expect(area).toHaveAttribute('data-direction', '')
  })
})
