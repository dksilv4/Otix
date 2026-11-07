import { useState, useEffect } from 'react'
import { Disc3, Mic2, Music, ListMusic, Search, Loader2, RotateCw, X, Sparkles } from 'lucide-react'
import { usePlexMusic } from '../../plex/hooks/use-plex-music'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { MusicCard } from '../molecules/music-card'
import { MusicTrackRow } from '../molecules/music-track-row'
import { MusicAlbumModal } from './music-album-modal'
import { MusicArtistModal } from './music-artist-modal'
import { usePlayer } from '@/lib/player/use-player'
import { useDebounceValue } from '../../hooks/use-debounce'

interface SelectedAlbumModalState {
  ratingKey: string
  title: string
  artist: string
  thumbUrl: string | null
  year: number | null
  trackCount: number | null
}

interface SelectedArtistModalState {
  ratingKey: string
  name: string
  thumbUrl: string | null
}

export const MusicPlexView = () => {
  const {
    sections,
    activeSectionId,
    activeServerId,
    setSelectedSectionId,
    browseType,
    setBrowseType,
    setSearchQuery,
    items,
    isLoading,
    isFetching,
    isDiscovering,
    discoverSections,
    playPlexItem,
    playPlexAlbumByRatingKey,
    playPlexArtistByRatingKey,
  } = usePlexMusic()

  const { currentTrack, isPlaying } = usePlayer()

  // Local search input with debouncing to prevent excessive Plex queries
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebounceValue(searchInput, 300)

  useEffect(() => {
    setSearchQuery(debouncedSearch)
  }, [debouncedSearch, setSearchQuery])

  // Modals state
  const [selectedAlbum, setSelectedAlbum] = useState<SelectedAlbumModalState | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<SelectedArtistModalState | null>(null)

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Top toolbar: Library selector + Live Scan + view pills + search */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 bg-[var(--dk-surface-raised)] border border-white/[0.04]">
        {/* Plex library picker & discover trigger */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2">
            <PlexIcon className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Library:
            </span>
          </div>

          {sections.length > 0 ? (
            <select
              value={activeSectionId ?? ''}
              onChange={(e) => setSelectedSectionId(Number(e.target.value))}
              className="rounded-xl bg-[var(--dk-surface-glass)] px-3 py-1.5 text-xs font-medium text-foreground border border-white/[0.04] focus:outline-none focus:border-primary/40"
            >
              {sections.map((sec) => (
                <option key={sec.id} value={sec.id} className="bg-[var(--dk-surface-overlay)] text-foreground">
                  {sec.title} ({sec.serverName})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-muted-foreground italic">
              No Plex music libraries detected
            </span>
          )}

          <button
            type="button"
            onClick={() => void discoverSections()}
            disabled={isDiscovering}
            title="Scan Plex servers for music libraries"
            aria-label="Scan Plex servers for music libraries"
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--dk-surface-glass)] text-muted-foreground hover:text-foreground transition-all border border-white/[0.04] active:scale-95 disabled:opacity-50"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isDiscovering ? 'animate-spin text-primary' : ''}`} />
          </button>
        </div>

        {/* View pills */}
        <div className="flex items-center rounded-xl bg-[var(--dk-surface-glass)] p-1 border border-white/[0.04]">
          <button
            type="button"
            onClick={() => setBrowseType('albums')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              browseType === 'albums'
                ? 'bg-[var(--dk-surface-glass-hover)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Disc3 className="h-3.5 w-3.5" />
            <span>Albums</span>
          </button>

          <button
            type="button"
            onClick={() => setBrowseType('artists')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              browseType === 'artists'
                ? 'bg-[var(--dk-surface-glass-hover)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Mic2 className="h-3.5 w-3.5" />
            <span>Artists</span>
          </button>

          <button
            type="button"
            onClick={() => setBrowseType('tracks')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              browseType === 'tracks'
                ? 'bg-[var(--dk-surface-glass-hover)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Music className="h-3.5 w-3.5" />
            <span>Tracks</span>
          </button>

          <button
            type="button"
            onClick={() => setBrowseType('playlists')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              browseType === 'playlists'
                ? 'bg-[var(--dk-surface-glass-hover)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ListMusic className="h-3.5 w-3.5" />
            <span>Playlists</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={`Search Plex ${browseType}...`}
            className="w-full rounded-xl bg-[var(--dk-surface-glass)] border border-white/[0.04] py-1.5 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
              aria-label="Clear search"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          {isFetching && !isLoading && (
            <div className="absolute right-8 top-1/2 -translate-y-1/2">
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl py-16 px-4 text-center border border-white/[0.04] bg-[var(--dk-surface-raised)]/40">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
            <PlexIcon className="h-8 w-8 opacity-60" />
          </div>
          <h3 className="text-base font-semibold text-foreground">No Plex music libraries</h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Make sure your Plex account is linked in Settings with a music section enabled,
            or scan your Plex servers now.
          </p>
          <button
            type="button"
            onClick={() => void discoverSections()}
            disabled={isDiscovering}
            className="mt-5 flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
          >
            {isDiscovering ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            <span>{isDiscovering ? 'Scanning Servers...' : 'Discover Plex Music'}</span>
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <p className="text-sm">
            {searchInput.trim()
              ? `No ${browseType} matching "${searchInput}"`
              : 'No items found in this section'}
          </p>
        </div>
      ) : (
        <>
          {browseType === 'tracks' ? (
            <div className="flex flex-col rounded-2xl p-2 bg-[var(--dk-surface-raised)] border border-white/[0.04]">
              {items.map((item, idx) => {
                const isThisActive = currentTrack?.id === item.ratingKey
                return (
                  <MusicTrackRow
                    key={item.ratingKey}
                    index={idx}
                    title={item.title}
                    artist={item.artist}
                    durationMs={item.durationMs}
                    coverArtUrl={item.thumbUrl}
                    isActive={isThisActive}
                    isPlaying={isPlaying && isThisActive}
                    onPlay={() => void playPlexItem(item)}
                  />
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {items.map((item) => (
                <MusicCard
                  key={item.ratingKey}
                  title={item.title}
                  subtitle={item.artist}
                  imageUrl={item.thumbUrl}
                  year={item.year}
                  trackCount={item.trackCount}
                  onClick={() => {
                    if (browseType === 'albums') {
                      setSelectedAlbum({
                        ratingKey: item.ratingKey,
                        title: item.title,
                        artist: item.artist,
                        thumbUrl: item.thumbUrl,
                        year: item.year,
                        trackCount: item.trackCount,
                      })
                    } else if (browseType === 'artists') {
                      setSelectedArtist({
                        ratingKey: item.ratingKey,
                        name: item.title,
                        thumbUrl: item.thumbUrl,
                      })
                    }
                  }}
                  onPlay={() => {
                    if (browseType === 'albums') {
                      void playPlexAlbumByRatingKey(
                        item.ratingKey,
                        item.title,
                        item.artist,
                        item.thumbUrl,
                      )
                    } else if (browseType === 'artists') {
                      void playPlexArtistByRatingKey(
                        item.ratingKey,
                        item.title,
                        item.thumbUrl,
                      )
                    } else {
                      void playPlexItem(item)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Album Modal */}
      {selectedAlbum && (
        <MusicAlbumModal
          open={!!selectedAlbum}
          onClose={() => setSelectedAlbum(null)}
          albumTitle={selectedAlbum.title}
          albumArtist={selectedAlbum.artist}
          coverArtUrl={selectedAlbum.thumbUrl}
          year={selectedAlbum.year}
          ratingKey={selectedAlbum.ratingKey}
          serverId={activeServerId}
        />
      )}

      {/* Artist Modal */}
      {selectedArtist && (
        <MusicArtistModal
          open={!!selectedArtist}
          onClose={() => setSelectedArtist(null)}
          ratingKey={selectedArtist.ratingKey}
          serverId={activeServerId}
          artistName={selectedArtist.name}
          artistThumb={selectedArtist.thumbUrl}
          onSelectAlbum={(alb) => {
            setSelectedAlbum({
              ratingKey: alb.ratingKey,
              title: alb.title,
              artist: alb.artist,
              thumbUrl: alb.thumbUrl,
              year: alb.year,
              trackCount: null,
            })
          }}
        />
      )}
    </div>
  )
}

