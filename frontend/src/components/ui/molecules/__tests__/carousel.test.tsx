import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Carousel } from '../carousel'

// Mock ResizeObserver
beforeEach(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any
})

describe('Carousel', () => {
  it('renders carousel with snap classes by default', () => {
    const { container } = render(
      <Carousel title="Test Carousel">
        <div data-testid="card-1">Card 1</div>
        <div data-testid="card-2">Card 2</div>
      </Carousel>,
    )

    expect(screen.getByText('Test Carousel')).toBeInTheDocument()
    expect(screen.getByTestId('card-1')).toBeInTheDocument()
    expect(screen.getByTestId('card-2')).toBeInTheDocument()

    // Track should have snap-x and snap-mandatory
    const track = container.querySelector('.snap-x.snap-mandatory')
    expect(track).toBeInTheDocument()

    // Each child wrapper should have snap-start and snap-always
    const snapItems = container.querySelectorAll('.snap-start.snap-always')
    expect(snapItems).toHaveLength(2)
  })

  it('allows disabling snapping when snap={false}', () => {
    const { container } = render(
      <Carousel title="No Snap Carousel" snap={false}>
        <div>Item 1</div>
      </Carousel>,
    )

    const snapTrack = container.querySelector('.snap-x.snap-mandatory')
    expect(snapTrack).not.toBeInTheDocument()

    const snapItem = container.querySelector('.snap-start')
    expect(snapItem).not.toBeInTheDocument()
  })

  it('triggers smooth scroll on keyboard arrow navigation', () => {
    const { container } = render(
      <Carousel title="Nav Carousel">
        <div>Item 1</div>
        <div>Item 2</div>
      </Carousel>,
    )

    const track = container.querySelector('[tabindex="0"]') as HTMLDivElement
    expect(track).toBeInTheDocument()

    const scrollBySpy = vi.fn()
    track.scrollBy = scrollBySpy

    fireEvent.keyDown(track, { key: 'ArrowRight' })
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    )

    fireEvent.keyDown(track, { key: 'ArrowLeft' })
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    )
  })

  it('triggers smooth scroll when clicking next and previous buttons', () => {
    const { container } = render(
      <Carousel title="Button Carousel" showArrows={true}>
        <div>Item 1</div>
        <div>Item 2</div>
      </Carousel>,
    )

    const track = container.querySelector('[tabindex="0"]') as HTMLDivElement
    const scrollBySpy = vi.fn()
    track.scrollBy = scrollBySpy

    const nextBtn = screen.getByRole('button', { name: /next items/i })
    fireEvent.click(nextBtn)
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    )

    const prevBtn = screen.getByRole('button', { name: /previous items/i })
    fireEvent.click(prevBtn)
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    )
  })
})
