import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ListComposer } from "./list-composer"

describe("ListComposer", () => {
  it("renders the dialog when open", () => {
    render(<ListComposer onClose={vi.fn()} onSave={vi.fn()} />)
    expect(screen.getByText("New List")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("My list name...")).toBeInTheDocument()
  })

  it("shows Edit List title when editing", () => {
    render(
      <ListComposer
        onClose={vi.fn()}
        onSave={vi.fn()}
        initial={{ id: "1", userId: "u1", name: "Existing", description: null, isPublic: false, likeCount: 0, isLiked: false, createdAt: "", updatedAt: "" }}
      />
    )
    expect(screen.getByText("Edit List")).toBeInTheDocument()
  })

  it("pre-fills fields from initial data", () => {
    render(
      <ListComposer
        onClose={vi.fn()}
        onSave={vi.fn()}
        initial={{ id: "1", userId: "u1", name: "My List", description: "A description", isPublic: true, likeCount: 0, isLiked: false, createdAt: "", updatedAt: "" }}
      />
    )
    expect(screen.getByDisplayValue("My List")).toBeInTheDocument()
    expect(screen.getByDisplayValue("A description")).toBeInTheDocument()
  })

  it("calls onClose when cancel is clicked", async () => {
    const onClose = vi.fn()
    render(<ListComposer onClose={onClose} onSave={vi.fn()} />)
    await userEvent.click(screen.getByText("Cancel"))
    expect(onClose).toHaveBeenCalled()
  })

  it("submits with name, description, and visibility", async () => {
    const onSave = vi.fn()
    render(<ListComposer onClose={vi.fn()} onSave={onSave} />)
    await userEvent.type(screen.getByPlaceholderText("My list name..."), "Best Movies")
    await userEvent.type(screen.getByPlaceholderText("Optional description..."), "Top picks")
    await userEvent.click(screen.getByText("Create"))
    expect(onSave).toHaveBeenCalledWith({
      name: "Best Movies",
      description: "Top picks",
      isPublic: false,
    })
  })

  it("does not submit with empty name", async () => {
    const onSave = vi.fn()
    render(<ListComposer onClose={vi.fn()} onSave={onSave} />)
    await userEvent.click(screen.getByText("Create"))
    expect(onSave).not.toHaveBeenCalled()
  })

  it("trims whitespace from name on submit", async () => {
    const onSave = vi.fn()
    render(<ListComposer onClose={vi.fn()} onSave={onSave} />)
    await userEvent.type(screen.getByPlaceholderText("My list name..."), "  Spaces  ")
    await userEvent.click(screen.getByText("Create"))
    expect(onSave).toHaveBeenCalledWith({
      name: "Spaces",
      description: null,
      isPublic: false,
    })
  })

  it("shows saving state", async () => {
    let resolveSave: () => void
    const promise = new Promise<void>((r) => { resolveSave = r })
    const onSave = vi.fn(() => promise)
    
    render(<ListComposer onClose={vi.fn()} onSave={onSave} />)
    await userEvent.type(screen.getByPlaceholderText("My list name..."), "Wait")
    await userEvent.click(screen.getByText("Create"))
    
    expect(screen.getByText("Saving...")).toBeDisabled()
    resolveSave!()
    await waitFor(() => expect(screen.getByText("Create")).not.toBeDisabled())
  })

  it("toggles public checkbox", async () => {
    const onSave = vi.fn()
    render(<ListComposer onClose={vi.fn()} onSave={onSave} />)
    await userEvent.type(screen.getByPlaceholderText("My list name..."), "Test")
    const checkbox = screen.getByRole("checkbox")
    await userEvent.click(checkbox)
    await userEvent.click(screen.getByText("Create"))
    expect(onSave).toHaveBeenCalledWith({
      name: "Test",
      description: null,
      isPublic: true,
    })
  })
})
