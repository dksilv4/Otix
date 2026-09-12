// TODO: Review this file
import { describe, expect, it, vi } from "vitest"
import { render, fireEvent } from "@testing-library/react"

import { TrackInlineActions } from "./media-track-inline-actions"

describe("TrackInlineActions", () => {
  it("returns null if not savable and not ratable", () => {
    const { container } = render(<TrackInlineActions />)
    expect(container.firstChild).toBeNull()
  })

  it("renders rating and triggers rate on click", () => {
    const mockRate = vi.fn()
    const { container } = render(<TrackInlineActions trackId="t1" onRate={mockRate} />)

    // InteractiveStar uses BEM classes for left/right hit areas
    const leftHits = container.querySelectorAll(".dk-review-interactive-star__hit--left")
    const rightHits = container.querySelectorAll(".dk-review-interactive-star__hit--right")
    expect(leftHits.length).toBeGreaterThan(0)
    expect(rightHits.length).toBeGreaterThan(0)

    // Click left half of star 1 → score 1, right half → score 2
    fireEvent.pointerDown(leftHits[0])
    fireEvent.pointerUp(leftHits[0])
    fireEvent.pointerDown(rightHits[0])
    fireEvent.pointerUp(rightHits[0])

    expect(mockRate).toHaveBeenCalledWith("t1", 2)
  })
})
