import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ActivityModulePlexSection } from '../components/molecules/activity-module-plex-section'
import { ActivityModulePlexCard } from '../components/molecules/activity-module-plex-card'
import * as plexHooks from '../hooks/use-plex-sessions'
import type { PlexSession } from '../types'

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
}))

vi.mock('@/lib/providers/auth', () => ({
  useAuth: () => ({ user: { username: 'testuser' }, isAuthenticated: true }),
}))

vi.mock('../hooks/use-plex-sessions', async (importOriginal) => {
  const actual = await importOriginal<typeof plexHooks>()
  return {
    ...actual,
    usePlexSessions: vi.fn(),
  }
})

const sampleSession: PlexSession = {
  session_id: 'sess-1',
  media_type: 'movie',
  title: 'Inception',
  grandparent_title: null,
  parent_title: null,
  index: null,
  thumb: 'https://plex.example.com/thumb.jpg',
  duration: 9000000,
  view_offset: 4500000,
  state: 'playing',
  user_name: 'alice',
  user_thumb: null,
  player_title: 'Living Room TV',
  player_device: 'Shield Android TV',
  player_platform: 'Android',
  server_name: 'HomeNAS',
  server_id: 'srv-1',
  server_owned: true,
  media_item_id: 12345,
  library_section: 'Movies',
  year: 2010,
  content_rating: 'PG-13',
  summary: 'A thief who steals corporate secrets through dream-sharing technology.',
  video_resolution: '1080',
  video_codec: 'h264',
  audio_codec: 'dca',
  audio_channels: 6,
  bitrate: 12000,
  video_decision: 'direct play',
  audio_decision: 'direct play',
  transcode_reason: null,
  throttled: false,
}

describe('ActivityModulePlexSection (Admin only)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when user is NOT an admin of the server', () => {
    vi.mocked(plexHooks.usePlexSessions).mockReturnValue({
      data: [sampleSession],
      sessions: [sampleSession],
      isAdmin: false,
    } as any)

    const { container } = render(<ActivityModulePlexSection />)
    expect(container.firstChild).toBeNull()
  })

  it('renders active plex streams when user IS an admin', () => {
    vi.mocked(plexHooks.usePlexSessions).mockReturnValue({
      data: [sampleSession],
      sessions: [sampleSession],
      isAdmin: true,
    } as any)

    render(<ActivityModulePlexSection />)
    expect(screen.getByText('Plex Streams')).toBeInTheDocument()
    expect(screen.getByText('1 active')).toBeInTheDocument()
    expect(screen.getByText('Inception')).toBeInTheDocument()
    expect(screen.getByText('Direct Play')).toBeInTheDocument()
  })
})

describe('ActivityModulePlexCard (Media Page Navigation)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates to /media/$mediaType/$mediaId when media_item_id is matched', () => {
    const onClose = vi.fn()
    render(<ActivityModulePlexCard s={sampleSession} onClose={onClose} />)

    const card = screen.getByRole('button')
    fireEvent.click(card)

    expect(onClose).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/media/$mediaType/$mediaId',
      params: { mediaType: 'movie', mediaId: '12345' },
    })
  })

  it('falls back to /search when media_item_id is not matched', () => {
    const unmatchedSession = { ...sampleSession, media_item_id: null }
    const onClose = vi.fn()
    render(<ActivityModulePlexCard s={unmatchedSession} onClose={onClose} />)

    const card = screen.getByRole('button')
    fireEvent.click(card)

    expect(onClose).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/search',
      search: { q: 'Inception' },
    })
  })

  it('handles camelCase properties from apiClient correctly', () => {
    const camelRaw = {
      sessionId: 'sess-camel',
      mediaType: 'episode',
      title: 'Pilot',
      grandparentTitle: 'Breaking Bad',
      parentTitle: 'Season 1',
      index: 1,
      duration: 3480000,
      viewOffset: 1200000,
      state: 'playing',
      userName: 'alice',
      serverOwned: true,
      mediaItemId: 999,
      videoResolution: '1080',
      audioCodec: 'aac',
      audioChannels: 2,
    }
    const normalized = plexHooks.normalizePlexSession(camelRaw)
    expect(normalized.session_id).toBe('sess-camel')
    expect(normalized.media_type).toBe('episode')
    expect(normalized.media_item_id).toBe(999)
    expect(normalized.grandparent_title).toBe('Breaking Bad')
    expect(normalized.view_offset).toBe(1200000)

    const onClose = vi.fn()
    render(<ActivityModulePlexCard s={normalized} onClose={onClose} />)
    expect(screen.getByText('Breaking Bad')).toBeInTheDocument()
    expect(screen.getByText(/S1E1/)).toBeInTheDocument()

    const card = screen.getByRole('button')
    fireEvent.click(card)
    expect(mockNavigate).toHaveBeenCalledWith({
      to: '/media/$mediaType/$mediaId',
      params: { mediaType: 'show', mediaId: '999' },
    })
  })
})
