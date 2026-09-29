import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ShareModal } from "./list-actions"
import type { UserListDetailOut } from "../../list-queries"

// Mock useAuth
vi.mock("@auth/hooks/use-auth", () => ({
  useAuth: () => ({
    user: { id: "user-1", username: "alice" },
    isAuthenticated: true,
  }),
}))

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
})

function renderWithClient(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

function makeDetail(overrides: Partial<UserListDetailOut> = {}): UserListDetailOut {
  return {
    id: "list-42",
    userId: "user-1",
    user: { id: "user-1", username: "alice", avatarUrl: null },
    name: "Sci-Fi Essentials",
    description: "Best sci-fi media of all time",
    isPublic: true,
    likeCount: 12,
    isLiked: false,
    itemCount: 3,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    items: [
      {
        id: "item-1",
        mediaType: "movie",
        title: "Interstellar",
        slug: "interstellar",
        posterUrl: "https://example.com/poster.jpg",
        textlessPosterUrl: null,
        logoUrl: null,
        releaseDate: "2014-11-07",
        popularity: 100,
        likeCount: 50,
        watchlistCount: 30,
        watchedCount: 80,
        playedCount: 0,
      },
    ],
    collaborators: [],
    ...overrides,
  }
}

describe("ShareModal", () => {
  it("renders list preview with curator and item count", () => {
    renderWithClient(<ShareModal list={makeDetail()} onClose={vi.fn()} />)
    expect(screen.getByText("Share List")).toBeInTheDocument()
    expect(screen.getByText("Sci-Fi Essentials")).toBeInTheDocument()
    expect(screen.getByText("Curated by @alice")).toBeInTheDocument()
    expect(screen.getByText(/3 items/i)).toBeInTheDocument()
  })

  it("renders owner visibility toggle", () => {
    renderWithClient(<ShareModal list={makeDetail({ isPublic: true })} onClose={vi.fn()} />)
    expect(screen.getByText("Public list")).toBeInTheDocument()
    expect(screen.getByText("Anyone with the link can view")).toBeInTheDocument()
  })

  it("displays shareable link with copy button", async () => {
    const user = userEvent.setup()
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      })
    } else {
      vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(writeTextMock)
    }

    renderWithClient(<ShareModal list={makeDetail()} onClose={vi.fn()} />)
    const copyButton = screen.getByRole("button", { name: /copy/i })
    expect(copyButton).toBeInTheDocument()

    await user.click(copyButton)
    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("/library/list-42"),
    )
  })

  it("renders social share links", () => {
    renderWithClient(<ShareModal list={makeDetail()} onClose={vi.fn()} />)
    expect(screen.getByText("Twitter / X")).toBeInTheDocument()
    expect(screen.getByText("Bluesky")).toBeInTheDocument()
    expect(screen.getByText("Reddit")).toBeInTheDocument()
    expect(screen.getByText("WhatsApp")).toBeInTheDocument()
  })
})
