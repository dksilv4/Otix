import { describe, it, expect, vi, beforeAll } from "vitest"
import { render, screen } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { LibraryOverviewPage } from "./library-overview-page"

beforeAll(() => {
  if (typeof global.ResizeObserver === "undefined") {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any
  }
})

// Mock router
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}))

// Mock auth
vi.mock("@/lib/providers/auth", () => ({
  useAuth: () => ({
    user: { username: "testuser", steamId: "steam123" },
    isAuthenticated: true,
  }),
  useOptionalAuth: () => ({
    user: { username: "testuser", steamId: "steam123" },
    isAuthenticated: true,
  }),
}))

// Mock library queries
vi.mock("../library-queries", () => ({
  useLibraryTab: (tab: string) => ({
    data: {
      pages: [
        {
          items: [
            {
              id: `item-${tab}-1`,
              title: `${tab.toUpperCase()} Item 1`,
              mediaType: "movie",
              posterUrl: null,
            },
          ],
          total: 42,
        },
      ],
    },
    isLoading: false,
  }),
  useStreamableMediaIds: vi.fn(() => ({ data: new Set(), isLoading: false })),
}))

// Mock user queries
vi.mock("@/features/user/user-queries", () => ({
  userQueries: {
    libraryStats: () => ({
      queryKey: ["user", "testuser", "library-stats"],
      queryFn: () => Promise.resolve({ totalItems: 100, completionRate: 0.75 }),
    }),
    continueWatching: () => ({
      queryKey: ["user", "me", "continue"],
      queryFn: () => Promise.resolve([]),
    }),
  },
}))

// Mock launcher
vi.mock("@/features/launcher/data/game-queries", () => ({
  useLocalGames: () => ({ data: [{ id: "g1", name: "Game 1" }] }),
}))

// Mock lists
vi.mock("@list", () => ({
  useUserLists: () => ({ data: [], isLoading: false }),
  ListCard: () => <div data-testid="list-card" />,
}))

// Mock quick stream
vi.mock("@/features/media/hooks/use-quick-stream", () => ({
  useQuickStream: () => ({
    quickStream: vi.fn(),
    isStartingStream: false,
    activeMediaId: null,
  }),
}))

describe("LibraryOverviewPage & LibraryStatsPod", () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  it("renders 4-stat soft glass pod with Watchlist, Watched & Played, Favorites, and Platforms & Games", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LibraryOverviewPage />
      </QueryClientProvider>,
    )

    expect(screen.getByText("Watchlist")).toBeInTheDocument()
    expect(screen.getByText("Watched & Played")).toBeInTheDocument()
    expect(screen.getByText("Favorites")).toBeInTheDocument()
    expect(screen.getByText("Platforms & Games")).toBeInTheDocument()
  })

  it("renders actionable reels headers when items exist", () => {
    render(
      <QueryClientProvider client={queryClient}>
        <LibraryOverviewPage />
      </QueryClientProvider>,
    )

    expect(screen.getByText("Recently Watchlisted")).toBeInTheDocument()
    expect(screen.getByText("Favorites & Liked")).toBeInTheDocument()
  })
})
