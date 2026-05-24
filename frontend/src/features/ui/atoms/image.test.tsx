import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { Image } from "./image"

describe("Image component", () => {
  it("renders loader skeleton initially", () => {
    const { container } = render(<Image src="test.jpg" alt="test" />)
    // Skeleton should be visible when loading
    const skeleton = container.querySelector(".animate-pulse")
    expect(skeleton).toBeInTheDocument()
  })

  it("removes skeleton on load", () => {
    const { container } = render(<Image src="test.jpg" alt="test" />)
    const img = screen.getByRole("img")
    fireEvent.load(img)
    const skeleton = container.querySelector(".animate-pulse")
    expect(skeleton).toBeNull()
  })

  it("renders fallback on error", () => {
    const mockOnError = vi.fn()
    render(<Image src="test.jpg" alt="TestAlt" fallback={<span>Fallback text</span>} onError={mockOnError} />)
    const img = screen.getByRole("img")
    fireEvent.error(img)
    expect(mockOnError).toHaveBeenCalled()
    expect(screen.getByText("Fallback text")).toBeInTheDocument()
  })

  it("renders default alt letter when error and no fallback provided", () => {
    render(<Image src="test.jpg" alt="TestAlt" />)
    const img = screen.getByRole("img")
    fireEvent.error(img)
    expect(screen.getByText("T")).toBeInTheDocument()
  })

  it("renders question mark when error and no alt/fallback provided", () => {
    render(<Image src="test.jpg" />)
    const img = screen.getByRole("img")
    fireEvent.error(img)
    expect(screen.getByText("?")).toBeInTheDocument()
  })
})
