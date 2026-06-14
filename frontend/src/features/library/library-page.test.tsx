// TODO: Review this file
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render as originalRender, screen } from "@testing-library/react"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
})

const render = (ui: React.ReactElement) => {
  return originalRender(
    React.createElement(QueryClientProvider, { client: queryClient }, ui)
  )
}

// Mock framer-motion
vi.mock("framer-motion", () => ({
  useInView: () => [() => {}, true],
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => React.createElement("div", props as Record<string, unknown>, children),
  },
}))

// Mock TanStack Router
const mockNavigate = vi.fn()
vi.mock("@tanstack/react-router", () => ({
  useParams: vi.fn(() => ({ tab: "watchlist" })),
  useNavigate: vi.fn(() => mockNavigate),
  useSearch: vi.fn(() => ({})),
  Link: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => React.createElement("a", props as Record<string, unknown>, children),
}))

// Mock auth
vi.mock("@/features/auth/auth-provider", () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: "1",
      email: "test@test.com",
      username: "testuser",
      isVerified: true,
      twoFactorEnabled: false,
      steamId: "steam-123",
      plexId: "plex-123",
      spotifyId: "spotify-123",
    },
    isLoading: false,
    isAuthenticated: true,
  })),
}))

// Mock query hooks
vi.mock("./library-queries", () => ({
  useLibraryTab: vi.fn(() => ({
    data: { pages: [{ items: [], nextCursor: null, hasMore: false }] },
    isLoading: false,
    isError: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
  useSteamLibraryScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false, data: null, error: null })),
  useUnmatchedSteamGames: vi.fn(() => ({
    data: { pages: [] },
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    refetch: vi.fn(),
  })),
  useSteamStatus: vi.fn(() => ({ data: { gameCount: 0, lastScannedAt: null } })),
  useSteamWishlist: vi.fn(() => ({
    data: { pages: [{ items: [], nextCursor: null, hasMore: false }] },
    isLoading: false,
    isError: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
  useSteamWishlistScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false, data: null, error: null })),
  usePlexLibraryScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false, data: null, error: null })),
  usePlexStatus: vi.fn(() => ({ data: { itemCount: 0, lastScannedAt: null } })),
  useSpotifyLibraryScan: vi.fn(() => ({ mutate: vi.fn(), isPending: false, data: null, error: null })),
  useSpotifyStatus: vi.fn(() => ({ data: { trackCount: 0, lastScannedAt: null } })),
  useSpotifyLikedTracks: vi.fn(() => ({
    data: { pages: [{ tracks: [], total: 0, nextOffset: null, hasMore: false }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  })),
  useSaveSpotifyTrack: vi.fn(() => ({ mutate: vi.fn() })),
  TAB_LABELS: {
    overview: "Overview",
    watchlist: "Watchlist",
    like: "Liked",
    watched: "Watched",
    played: "Played",
    listened: "Listened",
    spotify: "Spotify",
    steam: "Steam",
    plex: "Plex",
    wishlist: "Wishlist",
    lists: "Lists",
  },
  LIBRARY_TABS: ["overview", "watchlist", "like", "watched", "played", "listened", "spotify", "steam", "plex", "wishlist", "lists"],
}))

vi.mock("@/features/list/list-queries", () => ({
  useUserLists: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateList: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}))

vi.mock("@/features/spotify/use-player", () => ({
  usePlayer: vi.fn(() => ({
    source: 'spotify',
    playSpotifyQueue: vi.fn(),
    setSpotifyQueueMetadata: vi.fn(),
    currentTrack: null,
    isPlaying: false,
    spotifyIsReady: true,
    togglePlay: vi.fn(),
  })),
}))

vi.mock("@/features/media/media-queries", () => ({
  useRateTrack: vi.fn(() => ({ mutate: vi.fn() })),
}))

vi.mock("@/features/dk-ui/molecules/toast", () => ({
  useToast: vi.fn(() => ({ toast: vi.fn() })),
}))

// Import after mocks
import { LibraryListsPage } from "./pages/library-lists-page"
import { LibraryWatchlistPage } from "./pages/library-core-tab-pages"
import { useLibraryTab } from "./library-queries"

function createMediaItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "item-1",
    mediaType: "movie",
    title: "Test Item",
    slug: "test-item",
    posterUrl: null,
    textlessPosterUrl: null,
    logoUrl: null,
    releaseDate: "2024-01-01",
    popularity: 100,
    likeCount: 5,
    watchlistCount: 3,
    watchedCount: 10,
    playedCount: 0,
    userInteractions: null,
    ...overrides,
  }
}

describe("Library tab pages", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the lists tab content with empty state", () => {
    render(<LibraryListsPage />)
    expect(screen.getByText("No lists yet")).toBeInTheDocument()
    expect(screen.getByText("New List")).toBeInTheDocument()
  })

  it("renders empty state for core tabs", () => {
    render(<LibraryWatchlistPage />)
    expect(screen.getByText("No Watchlist items yet")).toBeInTheDocument()
  })

  it("renders media items in core tab content", () => {
    vi.mocked(useLibraryTab).mockReturnValue({
      data: { pages: [{ items: [createMediaItem()], nextCursor: null, hasMore: false }] },
      isLoading: false,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never)
    render(<LibraryWatchlistPage />)
    expect(screen.getByText("End of list")).toBeInTheDocument()
  })

  it("renders skeleton grid while loading", () => {
    vi.mocked(useLibraryTab).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
    } as never)
    render(<LibraryWatchlistPage />)
    // Skeleton grid renders 12 pulse divs inside a MediaGrid
    const pulseDivs = document.querySelectorAll(".animate-pulse")
    expect(pulseDivs.length).toBe(12)
  })
})

