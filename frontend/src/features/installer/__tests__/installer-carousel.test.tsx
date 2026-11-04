import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { InstallerCarousel } from '../components/installer-carousel'
import { INSTALLER_CAROUSEL_SLIDES } from '../constants'

describe('InstallerCarousel Component', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders initial slide and allows manual slide navigation via indicator pills', () => {
    render(<InstallerCarousel />)

    expect(screen.getByText(INSTALLER_CAROUSEL_SLIDES[0].title)).toBeDefined()
    expect(screen.getByText(INSTALLER_CAROUSEL_SLIDES[0].subtitle)).toBeDefined()

    // Click indicator for second slide
    const slide2Button = screen.getByRole('button', { name: 'Go to slide 2' })
    act(() => {
      fireEvent.click(slide2Button)
    })

    // Slide indicator 2 should be active (w-6)
    expect(slide2Button.className).toContain('w-6')
  })

  it('automatically advances slides over time', () => {
    render(<InstallerCarousel />)

    const slide2Button = screen.getByRole('button', { name: 'Go to slide 2' })
    expect(slide2Button.className).not.toContain('w-6')

    // Fast-forward interval
    act(() => {
      vi.advanceTimersByTime(4600)
    })

    // Slide 2 indicator should now be active
    expect(slide2Button.className).toContain('w-6')
  })
})
