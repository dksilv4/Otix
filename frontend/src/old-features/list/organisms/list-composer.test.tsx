// TODO: Review this file
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ListComposer } from "./list-composer"

describe("ListComposer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <ListComposer open={false} onClose={vi.fn()} onSave={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders the dialog when open", () => {
    render(<ListComposer open={true} onClose={vi.fn()} onSave={vi.fn()} />)
    expect(screen.getByText("New List")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("My list name...")).toBeInTheDocument()
  })

  it("shows Edit List title when editing", () => {
    render(
      <ListComposer
        open={true}
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
        open={true}
        onClose={vi.fn()}
        onSave={vi.fn()}
        initial={{ id: "1", userId: "u1", name: "My List", description: "A description", isPublic: true, likeCount: 0, isLiked: false, createdAt: "", updatedAt: "" }}
      />
    )
    expect(screen.getByDisplayValue("My List")).toBeInTheDocument()
    expect(screen.getByDisplayValue("A description")).toBeInTheDocument()
  })

  it("calls onClose when backdrop is clicked", async () => {
    const onClose = vi.fn()
    render(<ListComposer open={true} onClose={onClose} onSave={vi.fn()} />)
    const backdrop = document.querySelector(".dk-list-composer__backdrop")
    if (backdrop) await userEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it("calls onClose when cancel is clicked", async () => {
    const onClose = vi.fn()
    render(<ListComposer open={true} onClose={onClose} onSave={vi.fn()} />)
    await userEvent.click(screen.getByText("Cancel"))
    expect(onClose).toHaveBeenCalled()
  })

  it("submits with name, description, and visibility", async () => {
    const onSave = vi.fn()
    render(<ListComposer open={true} onClose={vi.fn()} onSave={onSave} />)
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
    render(<ListComposer open={true} onClose={vi.fn()} onSave={onSave} />)
    await userEvent.click(screen.getByText("Create"))
    expect(onSave).not.toHaveBeenCalled()
  })

  it("trims whitespace from name on submit", async () => {
    const onSave = vi.fn()
    render(<ListComposer open={true} onClose={vi.fn()} onSave={onSave} />)
    await userEvent.type(screen.getByPlaceholderText("My list name..."), "  Spaces  ")
    await userEvent.click(screen.getByText("Create"))
    expect(onSave).toHaveBeenCalledWith({
      name: "Spaces",
      description: null,
      isPublic: false,
    })
  })

  it("shows saving state", () => {
    render(<ListComposer open={true} onClose={vi.fn()} onSave={vi.fn()} isSaving={true} />)
    const button = screen.getByText("Saving...")
    expect(button).toBeDisabled()
  })

  it("toggles public checkbox", async () => {
    const onSave = vi.fn()
    render(<ListComposer open={true} onClose={vi.fn()} onSave={onSave} />)
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
