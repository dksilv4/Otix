import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { LibraryTabSettingsModal } from "./library-tab-settings-modal"
import { TAB_ORDER_KEY, VISIBILITY_KEY } from "../utils"

describe("LibraryTabSettingsModal", () => {
  const sampleTabs = [
    { id: "overview", label: "Overview", icon: <span data-testid="icon-overview" /> },
    { id: "watchlist", label: "Watchlist", icon: <span data-testid="icon-watchlist" /> },
    { id: "like", label: "Favorites", icon: <span data-testid="icon-like" /> },
  ]

  beforeEach(() => {
    localStorage.clear()
  })

  it("renders tab settings modal with tabs and headers", () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <LibraryTabSettingsModal
        allTabs={sampleTabs}
        currentOrder={["overview", "watchlist", "like"]}
        currentVisibility={["overview", "watchlist", "like"]}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    expect(screen.getByText("Customize Library Tabs")).toBeInTheDocument()
    expect(screen.getByText("Overview")).toBeInTheDocument()
    expect(screen.getByText("Watchlist")).toBeInTheDocument()
    expect(screen.getByText("Favorites")).toBeInTheDocument()
  })

  it("reorders tab positions down and persists immediately", () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <LibraryTabSettingsModal
        allTabs={sampleTabs}
        currentOrder={["overview", "watchlist", "like"]}
        currentVisibility={["overview", "watchlist", "like"]}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    const moveDownOverviewBtn = screen.getByLabelText("Move Overview down")
    fireEvent.click(moveDownOverviewBtn)

    expect(onSave).toHaveBeenCalledWith(
      ["watchlist", "overview", "like"],
      ["overview", "watchlist", "like"],
    )
    expect(localStorage.getItem(TAB_ORDER_KEY)).toBe(
      JSON.stringify(["watchlist", "overview", "like"]),
    )
  })

  it("reorders tab positions up and persists immediately", () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <LibraryTabSettingsModal
        allTabs={sampleTabs}
        currentOrder={["overview", "watchlist", "like"]}
        currentVisibility={["overview", "watchlist", "like"]}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    const moveUpWatchlistBtn = screen.getByLabelText("Move Watchlist up")
    fireEvent.click(moveUpWatchlistBtn)

    expect(onSave).toHaveBeenCalledWith(
      ["watchlist", "overview", "like"],
      ["overview", "watchlist", "like"],
    )
    expect(localStorage.getItem(TAB_ORDER_KEY)).toBe(
      JSON.stringify(["watchlist", "overview", "like"]),
    )
  })

  it("toggles tab visibility and persists changes", () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <LibraryTabSettingsModal
        allTabs={sampleTabs}
        currentOrder={["overview", "watchlist", "like"]}
        currentVisibility={["overview", "watchlist", "like"]}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    // Click on Favorites toggle
    const favButton = screen.getByText("Favorites").closest("button")
    expect(favButton).not.toBeNull()
    fireEvent.click(favButton!)

    expect(onSave).toHaveBeenCalled()
    const savedVisibility = JSON.parse(localStorage.getItem(VISIBILITY_KEY) || "[]")
    expect(savedVisibility).not.toContain("like")
    expect(savedVisibility).toContain("overview")
    expect(savedVisibility).toContain("watchlist")
  })

  it("resets preferences to default on clicking reset button", () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <LibraryTabSettingsModal
        allTabs={sampleTabs}
        currentOrder={["like", "overview", "watchlist"]}
        currentVisibility={["like"]}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    const resetBtn = screen.getByText("Reset to default")
    fireEvent.click(resetBtn)

    expect(onSave).toHaveBeenCalledWith(
      ["overview", "watchlist", "like"],
      ["overview", "watchlist", "like"],
    )
  })

  it("closes modal on clicking Done button or Close icon", () => {
    const onSave = vi.fn()
    const onClose = vi.fn()

    render(
      <LibraryTabSettingsModal
        allTabs={sampleTabs}
        currentOrder={["overview", "watchlist", "like"]}
        currentVisibility={["overview", "watchlist", "like"]}
        onSave={onSave}
        onClose={onClose}
      />,
    )

    fireEvent.click(screen.getByText("Done"))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByLabelText("Close modal"))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
