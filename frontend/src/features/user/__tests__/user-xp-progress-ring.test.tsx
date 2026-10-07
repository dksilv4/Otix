import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { XPProgressRing } from '../components/atoms/user-xp-progress-ring'

describe('XPProgressRing', () => {
  it('renders SVG with background track and progress arc circles', () => {
    const { container } = render(
      <XPProgressRing progress={0.75} size={32} strokeWidth={2} strokeColor="#a78bfa">
        <span>Avatar</span>
      </XPProgressRing>
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('width', '32')
    expect(svg).toHaveAttribute('height', '32')

    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBe(2)

    // Track circle
    expect(circles[0]).toHaveAttribute('stroke', 'rgba(255,255,255,0.08)')
    expect(circles[0]).toHaveAttribute('stroke-width', '2')

    // Progress arc
    expect(circles[1]).toHaveAttribute('stroke', '#a78bfa')
    expect(circles[1]).toHaveAttribute('stroke-width', '2')
  })
})
