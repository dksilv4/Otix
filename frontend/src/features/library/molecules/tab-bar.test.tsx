import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { TabBar } from "./tab-bar"

describe("TabBar", () => {
  const tabs = [
    { id: "overview", label: "Overview", icon: <span data-testid="icon-overview" /> },
    { id: "watchlist", label: "Watchlist", icon: <span data-testid="icon-watchlist" /> },
    { id: "watched", label: "Watched", icon: <span data-testid="icon-watched" /> },
  ]

  it("renders all tabs with icons and labels", () => {
    render(<TabBar tabs={tabs} activeTab="overview" onTabClick={vi.fn()} />)

    expect(screen.getByText("Overview")).toBeInTheDocument()
    expect(screen.getByText("Watchlist")).toBeInTheDocument()
    expect(screen.getByText("Watched")).toBeInTheDocument()
    expect(screen.getByTestId("icon-overview")).toBeInTheDocument()
  })

  it("calls onTabClick when a tab is clicked", () => {
    const onTabClick = vi.fn()
    render(<TabBar tabs={tabs} activeTab="overview" onTabClick={onTabClick} />)

    fireEvent.click(screen.getByText("Watchlist"))
    expect(onTabClick).toHaveBeenCalledWith("watchlist")
  })

  it("renders micro-spinner inside active tab capsule when isLoading is true", () => {
    const { container, rerender } = render(
      <TabBar tabs={tabs} activeTab="watchlist" onTabClick={vi.fn()} isLoading={false} />,
    )

    // No spinner when isLoading is false
    expect(container.querySelector(".animate-spin")).toBeNull()

    // Spinner appears when isLoading is true
    rerender(<TabBar tabs={tabs} activeTab="watchlist" onTabClick={vi.fn()} isLoading={true} />)
    const spinner = container.querySelector(".animate-spin")
    expect(spinner).not.toBeNull()
    expect(spinner).toHaveClass("h-3", "w-3", "text-primary")
  })

  it("renders micro-spinner for specific loadingTabId", () => {
    const { container } = render(
      <TabBar
        tabs={tabs}
        activeTab="overview"
        onTabClick={vi.fn()}
        loadingTabId="watched"
      />,
    )

    const spinner = container.querySelector(".animate-spin")
    expect(spinner).not.toBeNull()
  })
})
