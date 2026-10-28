import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { MediaActivityTag } from '../media-activity-tag'

describe('MediaActivityTag', () => {
  it('renders available status with play icon and tooltip', () => {
    render(
      <MediaActivityTag
        status="available"
        nodeName="Home NAS"
        isOwned={true}
      />,
    )

    const button = screen.getByRole('button', { name: /Available to stream · Home NAS/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('text-primary')
  })

  it('renders processing status with progress and loader icon', () => {
    render(
      <MediaActivityTag
        status="processing"
        progress={72}
        nodeName="Worker Node"
        isOwned={true}
      />,
    )

    const button = screen.getByRole('button', { name: /Downloading \(72%\) · Worker Node/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('text-sky-400')
  })

  it('renders requested status with clock icon', () => {
    render(
      <MediaActivityTag
        status="requested"
        nodeName="Friend Node"
        ownerName="Charlie"
        isOwned={false}
      />,
    )

    const button = screen.getByRole('button', { name: /Requested · Friend Node \(via Charlie\)/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveClass('text-amber-400')
  })

  it('triggers onClick with stopPropagation', () => {
    const handleClick = vi.fn()
    render(
      <MediaActivityTag
        status="available"
        onClick={handleClick}
      />,
    )

    const button = screen.getByRole('button')
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
