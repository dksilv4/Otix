// TODO: Review this file
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render as originalRender, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { steamPlatform } from "./steam"
import { plexPlatform } from "./plex"
import { spotifyPlatform } from "./spotify"
import { useLibraryTab, useSteamLibraryScan, useSteamStatus, useUnmatchedSteamGames, usePlexStatus, usePlexLibraryScan, useSpotifyStatus, useSpotifyLibraryScan, useSpotifyLikedTracks, streamPlexSync } from "../library-queries"


// Setup query client
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
const mockSearch = vi.fn(() => ({}))
vi.mock("@tanstack/react-router", () => ({
  useNavigate: vi.fn(() => mockNavigate),
  useSearch: vi.fn(() => mockSearch()),
  Link: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => React.createElement("a", props as Record<string, unknown>, children),
}))

// Mock Library Queries
vi.mock("../library-queries", () => ({
  useLibraryTab: vi.fn(),
  useSteamLibraryScan: vi.fn(),
  useSteamStatus: vi.fn(),
  useUnmatchedSteamGames: vi.fn(),
  usePlexStatus: vi.fn(),
  usePlexLibraryScan: vi.fn(),
  streamPlexSync: vi.fn().mockResolvedValue({ total: 0, matched: 0, seeded: 0 }),
  useSpotifyStatus: vi.fn(),
  useSpotifyLibraryScan: vi.fn(),
  useSpotifyLikedTracks: vi.fn(),
  useSaveSpotifyTrack: vi.fn(() => ({ mutate: vi.fn() })),
}))

// Mock Spotify Player Provider
const mockPlayWithQueue = vi.fn()
const mockSetQueueMetadata = vi.fn()
const mockTogglePlay = vi.fn()
vi.mock("@/features/spotify/use-player", () => ({
  usePlayer: vi.fn(() => ({
    source: 'spotify',
	    playSpotifyQueue: mockPlayWithQueue,
    setSpotifyQueueMetadata: mockSetQueueMetadata,
    currentTrack: null,
    isPlaying: false,
		    spotifyIsReady: true,
    togglePlay: mockTogglePlay,
  })),
}))

// Mock Media Queries
const mockRateTrackMutate = vi.fn()
vi.mock("@/features/media/media-queries", () => ({
  useRateTrack: vi.fn(() => ({
    mutate: mockRateTrackMutate,
  })),
}))

// Mock Toast
const mockToast = vi.fn()
vi.mock("@/features/dk-ui/molecules/toast", () => ({
  useToast: vi.fn(() => ({
    toast: mockToast,
  })),
}))

describe("Platforms Component Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearch.mockReturnValue({})
  })

  describe("Steam Platform", () => {
    it("renders steam platform definition basics", () => {
      expect(steamPlatform.id).toBe("steam")
      expect(steamPlatform.label).toBe("Steam")
      expect(steamPlatform.requiresConnection({ steamId: "yes" } as any)).toBe(true)
      expect(steamPlatform.requiresConnection({} as any)).toBe(false)
    })

    it("renders EmptyState correctly and responds to scan trigger", async () => {
      const mockScan = vi.fn()
      const EmptyState = steamPlatform.EmptyState
      render(<EmptyState onScan={mockScan} isScanning={false} scanResult={null} scanError={null} />)

      expect(screen.getByText("Steam library empty")).toBeInTheDocument()
      const scanButton = screen.getByRole("button", { name: /scan library/i })
      await userEvent.click(scanButton)
      expect(mockScan).toHaveBeenCalled()
    })

    it("renders DashboardSection correctly", () => {
      vi.mocked(useLibraryTab).mockReturnValue({
        data: { pages: [{ items: [{ id: "game-1", title: "Portal 2", mediaType: "game", steamPlaytimeForever: 120 }] }] },
        isLoading: false,
      } as any)

      const Dashboard = steamPlatform.DashboardSection
      render(<Dashboard />)
      expect(screen.getByText("Portal 2")).toBeInTheDocument()
      expect(screen.getByText("2h")).toBeInTheDocument()
    })

    it("renders Content correctly with game and handles unmatched toggle", async () => {
      vi.mocked(useLibraryTab).mockReturnValue({
        data: { pages: [{ items: [{ id: "game-1", title: "Portal 2", mediaType: "game", steamPlaytimeForever: 120, steamPlaytime2weeks: 30, steamRtimeLastPlayed: Math.floor(Date.now() / 1000 - 3600) }] }] },
        isLoading: false,
        isError: false,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any)

      vi.mocked(useSteamStatus).mockReturnValue({
        data: { gameCount: 1, lastScannedAt: new Date().toISOString() },
      } as any)

      vi.mocked(useSteamLibraryScan).mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
        data: null,
        error: null,
      } as any)

      const mockRefetch = vi.fn()
      vi.mocked(useUnmatchedSteamGames).mockReturnValue({
        data: undefined,
        isLoading: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        isFetchingNextPage: false,
        refetch: mockRefetch,
      } as any)

      const Content = steamPlatform.Content
      render(<Content />)

      expect(screen.getByText("Portal 2")).toBeInTheDocument()
      expect(screen.getByText("2h")).toBeInTheDocument()

      const unmatchedToggle = screen.getByRole("button", { name: /show unmatched/i })
      await userEvent.click(unmatchedToggle)
      expect(mockRefetch).toHaveBeenCalled()
    })
  })

  describe("Plex Platform", () => {
    it("renders plex platform definition basics", () => {
      expect(plexPlatform.id).toBe("plex")
      expect(plexPlatform.label).toBe("Plex")
      expect(plexPlatform.requiresConnection({ plexId: "yes" } as any)).toBe(true)
    })

    it("renders DashboardSection correctly", () => {
      vi.mocked(useLibraryTab).mockReturnValue({
        data: { pages: [{ items: [{ id: "movie-1", title: "Inception", mediaType: "movie", plexViewCount: 2 }] }] },
        isLoading: false,
      } as any)

      const Dashboard = plexPlatform.DashboardSection
      render(<Dashboard />)
      expect(screen.getByText("Inception")).toBeInTheDocument()
      expect(screen.getByText("Viewed 2 times")).toBeInTheDocument()
    })

    it("renders Content correctly with movies and handles scanning", async () => {
      vi.mocked(useLibraryTab).mockReturnValue({
        data: { pages: [{ items: [{ id: "movie-1", title: "Inception", mediaType: "movie", plexViewCount: 2, plexLastViewedAt: new Date().toISOString() }] }] },
        isLoading: false,
        isError: false,
        fetchNextPage: vi.fn(),
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any)

      vi.mocked(usePlexStatus).mockReturnValue({
        data: { itemCount: 1, lastScannedAt: new Date().toISOString() },
      } as any)

      // plex.tsx now calls streamPlexSync directly, not the hook
      vi.mocked(streamPlexSync).mockResolvedValue({ total: 10, matched: 8, seeded: 2 })

      const Content = plexPlatform.Content
      render(<Content />)

      expect(screen.getByText("Inception")).toBeInTheDocument()
      expect(screen.getByText("Viewed 2 times")).toBeInTheDocument()

      const resyncBtn = screen.getByRole("button", { name: /resync/i })
      await userEvent.click(resyncBtn)
      expect(streamPlexSync).toHaveBeenCalled()
    })
  })

  describe("Spotify Platform", () => {
    it("renders spotify platform definition basics", () => {
      expect(spotifyPlatform.id).toBe("spotify")
      expect(spotifyPlatform.label).toBe("Spotify")
      expect(spotifyPlatform.requiresConnection({ spotifyId: "yes" } as any)).toBe(true)
    })

    it("renders DashboardSection correctly", () => {
      vi.mocked(useSpotifyLikedTracks).mockReturnValue({
        data: { pages: [{ tracks: [], total: 42, nextOffset: null, hasMore: false }] },
      } as any)

      const Dashboard = spotifyPlatform.DashboardSection
      render(<Dashboard />)
      expect(screen.getByText("Liked Songs")).toBeInTheDocument()
      expect(screen.getByText("42 tracks")).toBeInTheDocument()
    })

    it("renders Content in overview mode correctly", () => {
      vi.mocked(useLibraryTab).mockReturnValue({
        data: { pages: [{ items: [{ id: "album-1", title: "Discovery", mediaType: "music", posterUrl: "abc" }] }] },
        isLoading: false,
      } as any)
      vi.mocked(useSpotifyLikedTracks).mockReturnValue({
        data: { pages: [{ tracks: [], total: 10, nextOffset: null, hasMore: false }] },
      } as any)
      vi.mocked(useSpotifyStatus).mockReturnValue({
        data: { trackCount: 10 },
      } as any)
      vi.mocked(useSpotifyLibraryScan).mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as any)

      const Content = spotifyPlatform.Content
      render(<Content />)

      expect(screen.getByText("Discovery")).toBeInTheDocument()
      expect(screen.getAllByText("Liked Songs")[0]).toBeInTheDocument()
      expect(screen.getByText("10 tracks")).toBeInTheDocument()
    })

    it("renders Content in liked mode correctly and triggers play", async () => {
      mockSearch.mockReturnValue({ view: "liked" })

      vi.mocked(useSpotifyLikedTracks).mockReturnValue({
        data: { pages: [{ tracks: [{ id: "track-1", name: "One More Time", artist: "Daft Punk", durationMs: 320000, uri: "spotify:track:1" }], total: 1 }], isLoading: false },
        isLoading: false,
        isError: false,
        hasNextPage: false,
        isFetchingNextPage: false,
      } as any)

      vi.mocked(useSpotifyStatus).mockReturnValue({
        data: { trackCount: 1 },
      } as any)
      vi.mocked(useSpotifyLibraryScan).mockReturnValue({
        mutate: vi.fn(),
        isPending: false,
      } as any)

      const Content = spotifyPlatform.Content
      render(<Content />)

      expect(screen.getByText("One More Time")).toBeInTheDocument()
      expect(screen.getByText("Daft Punk")).toBeInTheDocument()

      const trackRow = screen.getByRole("button", { name: /1 One More Time/i })
      await userEvent.click(trackRow)
      expect(mockSetQueueMetadata).toHaveBeenCalled()
      expect(mockPlayWithQueue).toHaveBeenCalledWith(["spotify:track:1"])
    })
  })
})
