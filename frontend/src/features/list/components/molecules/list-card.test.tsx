// TODO: Review this file
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { ListCard } from "./list-card"
import type { UserListOut } from "../../list-queries"

// Mock TanStack Router Link
vi.mock("@tanstack/react-router", () => ({
  Link: ({ _to, params, children, className, ...props }: { _to?: unknown; params?: Record<string, string>; children?: React.ReactNode; className?: string; [key: string]: unknown }) =>
    React.createElement("a", { href: `/list/${params ? params.listId : ""}`, className, ...props } as Record<string, unknown>, children),
}))

function makeList(overrides: Partial<UserListOut> = {}): UserListOut {
  return {
    id: "list-1",
    userId: "user-1",
    name: "My Awesome List",
    description: "A curated collection of favorites",
    isPublic: true,
    likeCount: 5,
    isLiked: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    ...overrides,
  }
}

describe("ListCard", () => {
  it("renders the list name", () => {
    render(<ListCard list={makeList()} />)
    expect(screen.getByText("My Awesome List")).toBeInTheDocument()
  })

  it("renders the list description", () => {
    render(<ListCard list={makeList()} />)
    expect(screen.getByText("A curated collection of favorites")).toBeInTheDocument()
  })

  it("hides description when not provided", () => {
    render(<ListCard list={makeList({ description: null })} />)
    expect(screen.queryByText("A curated collection of favorites")).not.toBeInTheDocument()
  })

  it("shows Public badge for public lists", () => {
    render(<ListCard list={makeList({ isPublic: true })} />)
    expect(screen.getByText("Public")).toBeInTheDocument()
  })

  it("shows Private badge for private lists", () => {
    render(<ListCard list={makeList({ isPublic: false })} />)
    expect(screen.getByText("Private")).toBeInTheDocument()
  })

  it("links to the list detail page", () => {
    render(<ListCard list={makeList({ id: "my-list-id" })} />)
    const link = screen.getByRole("link")
    expect(link.getAttribute("href")).toContain("my-list-id")
  })

  it("truncates long names", () => {
    render(<ListCard list={makeList({ name: "A".repeat(100) })} />)
    const title = screen.getByText("A".repeat(100))
    expect(title.className).toContain("dk-list-card__title")
  })

  it("renders selection checkbox when selectable is true", () => {
    render(<ListCard list={makeList({ id: "list-1", name: "Selectable List" })} selectable selected={false} />)
    expect(screen.getByRole("button", { name: "Select Selectable List" })).toBeInTheDocument()
  })

  it("calls onSelect when card is clicked in selectable mode", async () => {
    const onSelect = vi.fn()
    render(<ListCard list={makeList({ id: "list-1", name: "Clickable List" })} selectable selected={false} onSelect={onSelect} />)
    const card = screen.getByRole("link")
    await userEvent.click(card)
    expect(onSelect).toHaveBeenCalledWith("list-1", true)
  })

  it("calls onSelect when checkbox button is clicked", async () => {
    const onSelect = vi.fn()
    render(<ListCard list={makeList({ id: "list-1", name: "Toggle List" })} selectable selected={true} onSelect={onSelect} />)
    const checkbox = screen.getByRole("button", { name: "Deselect Toggle List" })
    await userEvent.click(checkbox)
    expect(onSelect).toHaveBeenCalledWith("list-1", false)
  })
})
