import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { TrackInlineActions } from "./track-inline-actions"

describe("TrackInlineActions", () => {
  it("returns null if not savable and not ratable", () => {
    const { container } = render(<TrackInlineActions />)
    expect(container.firstChild).toBeNull()
  })

  it("renders rating and triggers rate on click", () => {
    const mockRate = vi.fn()
    const { container } = render(<TrackInlineActions trackId="t1" onRate={mockRate} />)

    // The rating component displays 5 stars, which contains 10 half/full hit area spans (inset-0 class).
    // Let's query by selector or find class.
    const hitAreas = container.querySelectorAll(".absolute.inset-0")
    expect(hitAreas.length).toBeGreaterThan(0)

    // Trigger pointer enter/move/down on the first hit area (score 1)
    fireEvent.pointerEnter(hitAreas[0])
    fireEvent.pointerMove(hitAreas[0])
    fireEvent.pointerDown(hitAreas[0])
    // Also enter/move on the second hit area (score 2)
    fireEvent.pointerEnter(hitAreas[1])
    fireEvent.pointerMove(hitAreas[1])
    fireEvent.pointerDown(hitAreas[1])

    // The StarInput handlePointerUp executes the onChange on pointer up.
    // So we need to trigger pointerUp on the container/parent to commit the score.
    const ratingContainer = container.querySelector(".relative.inline-flex")
    expect(ratingContainer).toBeInTheDocument()
    fireEvent.pointerUp(ratingContainer!)

    expect(mockRate).toHaveBeenCalledWith("t1", 2)
  })

  it("renders spotify save button and handles click", () => {
    const mockSave = vi.fn()
    render(<TrackInlineActions spotifyId="s1" onSaveSpotify={mockSave} />)

    const saveBtn = screen.getByRole("button", { name: /add to spotify liked songs/i })
    expect(saveBtn).toBeInTheDocument()
    fireEvent.click(saveBtn)
    expect(mockSave).toHaveBeenCalledWith("s1")
  })

  it("shows disabled/liked state for spotify", () => {
    render(<TrackInlineActions spotifyId="s1" spotifyLiked={true} onSaveSpotify={vi.fn()} />)
    const saveBtn = screen.getByRole("button", { name: /saved to spotify liked songs/i })
    expect(saveBtn).toBeInTheDocument()
    expect(saveBtn).toBeDisabled()
  })
})
