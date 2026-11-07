import { useState, useCallback } from 'react'
import { Helmet } from 'react-helmet-async'
import {
  ListMusic,
  FolderPlus,
  Folder,
  RotateCw,
  Search,
  X,
  Disc3,
  Mic2,
  Music,
  HardDrive,
  Loader2,
  Sparkles,
} from 'lucide-react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import {
  useUnifiedMusic,
  type UnifiedAlbum,
  type UnifiedArtist,
  type UnifiedTrack,
} from '../hooks/use-unified-music'
import { useProgressiveRender } from '../hooks/use-progressive-render'
import { MusicCard } from '../components/molecules/music-card'
import { MusicTrackRow } from '../components/molecules/music-track-row'
import { MusicAlbumModal, type AlbumTrackItem } from '../components/organisms/music-album-modal'
import { MusicArtistModal } from '../components/organisms/music-artist-modal'
import { MusicQueueDrawer } from '../components/organisms/music-queue-drawer'
import { MusicFoldersModal } from '../components/organisms/music-folders-modal'
import { usePlayer } from '@/lib/player/use-player'
import { useDesktopPlatform } from '@/lib/desktop/platform'

export const MusicPage = () => {
  const {
    viewMode,
    setViewMode,
    sourceFilter,
    setSourceFilter,
    searchQuery,
    setSearchQuery,
    albums,
    artists,
    tracks,
    stats,
    currentTrack,
    isPlaying,
    isLoading,
    isScanning,
    scanProgress,
    folders,
    scanDirectory,
    removeFolder,
    clearLocalLibrary,
    sections,
    activeSectionId,
    activeServerId,
    setSelectedSectionId,
    discoverSections,
    isDiscovering,
    playTrackInContext,
    playAlbumInContext,
    playArtistInContext,
  } = useUnifiedMusic()

  const { isDesktop } = useDesktopPlatform()
  const stickyTopOffset = isDesktop ? 'top-20 md:top-24' : 'top-14 md:top-18'

  const { localQueue, plexQueue, source } = usePlayer()
  const queueCount = (source === 'local' ? localQueue : plexQueue).length

  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isFoldersModalOpen, setIsFoldersModalOpen] = useState(false)
  const [selectedAlbum, setSelectedAlbum] = useState<UnifiedAlbum | null>(null)
  const [selectedArtist, setSelectedArtist] = useState<UnifiedArtist | null>(null)

  // Progressive rendering for albums, artists, and tracks to maintain 60fps scrolling
  const {
    visibleItems: visibleAlbums,
    hasMore: hasMoreAlbums,
    sentinelRef: albumsSentinelRef,
  } = useProgressiveRender({
    items: albums,
    initialCount: 48,
    step: 36,
    resetDeps: [viewMode, sourceFilter, searchQuery],
  })

  const {
    visibleItems: visibleArtists,
    hasMore: hasMoreArtists,
    sentinelRef: artistsSentinelRef,
  } = useProgressiveRender({
    items: artists,
    initialCount: 48,
    step: 36,
    resetDeps: [viewMode, sourceFilter, searchQuery],
  })

  const {
    visibleItems: visibleTracks,
    hasMore: hasMoreTracks,
    sentinelRef: tracksSentinelRef,
  } = useProgressiveRender({
    items: tracks,
    initialCount: 80,
    step: 60,
    resetDeps: [viewMode, sourceFilter, searchQuery],
  })

  // Map local album tracks to AlbumTrackItem format for MusicAlbumModal
  const selectedAlbumLocalTracks: AlbumTrackItem[] | undefined = selectedAlbum?.tracks
    ? selectedAlbum.tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        trackNumber: t.trackNumber,
        durationMs: t.durationMs,
      }))
    : undefined

  const handlePlayTrack = useCallback(
    (track: UnifiedTrack) => {
      void playTrackInContext(track, tracks)
    },
    [playTrackInContext, tracks],
  )

  const hasAnyMusic = stats.totalTracks > 0 || stats.totalAlbums > 0 || stats.totalArtists > 0

  return (
    <>
      <Helmet>
        <title>Music · Otix</title>
      </Helmet>

      <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-32">
        {/* Sticky Header Options & Toolbar */}
        <div
          className={`sticky ${stickyTopOffset} z-20 flex flex-col gap-3 rounded-2xl sm:rounded-3xl bg-[var(--dk-surface-overlay)]/90 backdrop-blur-2xl border border-white/[0.06] p-3 sm:p-4 shadow-[var(--dk-shadow-dialog)] transition-all`}
        >
          {/* Top Row: Title, Stats, Search, Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
            {/* Left: Title & Live Library Statistics */}
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Music</h1>
                {hasAnyMusic && (
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--dk-surface-raised)] text-xs text-muted-foreground border border-white/[0.04]">
                    <span>{stats.totalTracks.toLocaleString()} tracks</span>
                    <span>•</span>
                    <span>{stats.totalAlbums} albums</span>
                    <span>•</span>
                    <span>{stats.totalArtists} artists</span>
                  </div>
                )}
              </div>
            </div>

            {/* Center: Real-Time Unified Search Input */}
            <div className="relative flex-1 max-w-sm min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search songs, albums, artists..."
                className="w-full rounded-2xl bg-[var(--dk-surface-raised)] pl-10 pr-9 py-2 text-xs font-medium text-foreground placeholder:text-muted-foreground border border-white/[0.04] focus:outline-none focus:border-primary/40 focus:bg-[var(--dk-surface-overlay)] transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Right: Quick Action Controls */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Add Local Folder */}
              <button
                type="button"
                onClick={() => void scanDirectory()}
                disabled={isScanning}
                className="flex items-center gap-1.5 rounded-2xl bg-[var(--dk-surface-raised)] hover:bg-[var(--dk-surface-glass-hover)] px-3 py-2 text-xs font-medium text-foreground border border-white/[0.04] shadow-sm transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Add a local music folder to scan and index"
              >
                {isScanning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span className="hidden md:inline">Scanning...</span>
                  </>
                ) : (
                  <>
                    <FolderPlus className="h-3.5 w-3.5 text-primary" />
                    <span className="hidden md:inline">Add Folder</span>
                  </>
                )}
              </button>

              {/* Folders Management Pill */}
              {folders.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsFoldersModalOpen(true)}
                  className="flex items-center gap-1.5 rounded-2xl bg-[var(--dk-surface-raised)] hover:bg-[var(--dk-surface-glass-hover)] px-3 py-2 text-xs font-medium text-foreground border border-white/[0.04] transition-all cursor-pointer"
                  title="Manage indexed folders"
                >
                  <Folder className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="hidden lg:inline">Folders</span>
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--dk-surface-raised)] text-[10px]">
                    {folders.length}
                  </span>
                </button>
              )}

              {/* Sync Plex Libraries */}
              <button
                type="button"
                onClick={() => void discoverSections()}
                disabled={isDiscovering}
                className="flex items-center gap-1.5 rounded-2xl bg-[var(--dk-surface-raised)] hover:bg-[var(--dk-surface-glass-hover)] px-3 py-2 text-xs font-medium text-foreground border border-white/[0.04] shadow-sm transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer"
                title="Sync and scan Plex music libraries"
              >
                <RotateCw
                  className={`h-3.5 w-3.5 ${isDiscovering ? 'animate-spin text-primary' : 'text-primary'}`}
                />
                <span className="hidden md:inline">Sync Plex</span>
              </button>

              {/* Plex Library Selector if multiple sections */}
              {sections.length > 1 && (
                <select
                  value={activeSectionId ?? ''}
                  onChange={(e) => setSelectedSectionId(Number(e.target.value))}
                  className="hidden xl:block rounded-2xl bg-[var(--dk-surface-raised)] px-3 py-2 text-xs font-medium text-foreground border border-white/[0.04] focus:outline-none focus:border-primary/40 cursor-pointer"
                >
                  {sections.map((sec) => (
                    <option
                      key={sec.id}
                      value={sec.id}
                      className="bg-[var(--dk-surface-overlay)] text-foreground"
                    >
                      {sec.title} ({sec.serverName})
                    </option>
                  ))}
                </select>
              )}

              {/* Play Queue Drawer Trigger */}
              <button
                type="button"
                onClick={() => setIsQueueOpen(true)}
                className="flex items-center gap-2 rounded-2xl bg-[var(--dk-surface-raised)] hover:bg-[var(--dk-surface-glass-hover)] px-3.5 py-2 text-xs font-semibold text-foreground border border-white/[0.04] shadow-sm transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <ListMusic className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">Play Queue</span>
                {queueCount > 0 && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">
                    {queueCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Live Scanning Progress Banner */}
          {isScanning && scanProgress && (
            <div className="flex flex-col gap-1.5 rounded-xl sm:rounded-2xl bg-[var(--dk-surface-raised)] p-3 text-xs text-muted-foreground border border-white/[0.04]">
              <div className="flex justify-between font-mono">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  <span>Indexing local music files in real time...</span>
                </span>
                <span>
                  {scanProgress.current} / {scanProgress.total}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--dk-surface-raised)]">
                <div
                  className="h-full bg-primary transition-all duration-150"
                  style={{
                    width: `${
                      scanProgress.total > 0
                        ? (scanProgress.current / scanProgress.total) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Bottom Row: Sub-Navigation & Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.04] pt-3">
            {/* View Category Pills */}
            <div className="flex items-center rounded-2xl bg-[var(--dk-surface-raised)] p-1 border border-white/[0.04]">
              <button
                type="button"
                onClick={() => setViewMode('albums')}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'albums'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Disc3 className="h-3.5 w-3.5" />
                <span>Albums ({albums.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('artists')}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'artists'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Mic2 className="h-3.5 w-3.5" />
                <span>Artists ({artists.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('tracks')}
                className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'tracks'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Music className="h-3.5 w-3.5" />
                <span>Tracks ({tracks.length})</span>
              </button>
            </div>

            {/* Source Filter Pills */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mr-1 hidden sm:inline">
                Source:
              </span>
              <div className="flex items-center rounded-2xl bg-[var(--dk-surface-raised)] p-1 border border-white/[0.04]">
                <button
                  type="button"
                  onClick={() => setSourceFilter('all')}
                  className={`rounded-xl px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                    sourceFilter === 'all'
                      ? 'bg-[var(--dk-surface-glass-hover)] text-foreground font-semibold shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  All Sources
                </button>

                <button
                  type="button"
                  onClick={() => setSourceFilter('plex')}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                    sourceFilter === 'plex'
                      ? 'bg-[var(--dk-surface-glass-hover)] text-foreground font-semibold shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <PlexIcon className="h-3.5 w-3.5" />
                  <span>Plex</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceFilter('local')}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-medium transition-all cursor-pointer ${
                    sourceFilter === 'local'
                      ? 'bg-[var(--dk-surface-glass-hover)] text-foreground font-semibold shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>Local</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Views */}
        {isLoading && !hasAnyMusic ? (
          <div className="flex items-center justify-center p-20 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !hasAnyMusic ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center rounded-3xl p-16 text-center text-muted-foreground bg-[var(--dk-surface-raised)] border border-white/[0.04] gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary">
              <Sparkles className="h-8 w-8 stroke-[1.75]" />
            </div>
            <div className="flex flex-col gap-1 max-w-md">
              <h3 className="text-lg font-bold text-foreground">Build Your Music Library</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Seamlessly play audio files directly from your computer or stream directly from your
                connected Plex media servers.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
              <button
                type="button"
                onClick={() => void scanDirectory()}
                className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-md transition-transform hover:scale-[1.02] active:scale-95 cursor-pointer"
              >
                <FolderPlus className="h-4 w-4" />
                <span>Add Local Folder</span>
              </button>

              <button
                type="button"
                onClick={() => void discoverSections()}
                className="flex items-center gap-2 rounded-2xl bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] px-4 py-2 text-xs font-semibold text-foreground border border-white/[0.04] transition-all cursor-pointer"
              >
                <RotateCw className="h-4 w-4 text-primary" />
                <span>Scan Plex Music</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Albums View */}
            {viewMode === 'albums' && (
              albums.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  No albums found matching your filter or search.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {visibleAlbums.map((album) => (
                      <MusicCard
                        key={album.id}
                        title={album.title}
                        subtitle={album.artist}
                        imageUrl={album.thumbUrl}
                        year={album.year}
                        trackCount={album.trackCount}
                        source={album.source}
                        onClick={() => setSelectedAlbum(album)}
                        onPlay={() => void playAlbumInContext(album)}
                      />
                    ))}
                  </div>
                  {hasMoreAlbums && (
                    <div ref={albumsSentinelRef} className="h-8 w-full" aria-hidden="true" />
                  )}
                </>
              )
            )}

            {/* Artists View */}
            {viewMode === 'artists' && (
              artists.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  No artists found matching your filter or search.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {visibleArtists.map((artist) => (
                      <MusicCard
                        key={artist.id}
                        title={artist.name}
                        subtitle="Artist"
                        imageUrl={artist.thumbUrl}
                        source={artist.source === 'both' ? 'plex' : artist.source}
                        onClick={() => setSelectedArtist(artist)}
                        onPlay={() => void playArtistInContext(artist)}
                      />
                    ))}
                  </div>
                  {hasMoreArtists && (
                    <div ref={artistsSentinelRef} className="h-8 w-full" aria-hidden="true" />
                  )}
                </>
              )
            )}

            {/* Tracks View (Progressively rendered with automatic playlist queue on click) */}
            {viewMode === 'tracks' && (
              tracks.length === 0 ? (
                <div className="p-12 text-center text-xs text-muted-foreground">
                  No tracks found matching your filter or search.
                </div>
              ) : (
                <div className="flex flex-col rounded-2xl p-2 bg-[var(--dk-surface-raised)] border border-white/[0.04]">
                  {visibleTracks.map((track, idx) => {
                    const isThisActive = currentTrack?.id === track.id
                    return (
                      <MusicTrackRow
                        key={`${track.id}-${idx}`}
                        index={idx}
                        trackNumber={track.trackNumber}
                        title={track.title}
                        artist={track.artist}
                        albumName={track.albumName}
                        durationMs={track.durationMs}
                        coverArtUrl={track.thumbUrl}
                        source={track.source}
                        isActive={isThisActive}
                        isPlaying={isPlaying && isThisActive}
                        onPlay={() => handlePlayTrack(track)}
                      />
                    )
                  })}
                  {hasMoreTracks && (
                    <div ref={tracksSentinelRef} className="h-8 w-full" aria-hidden="true" />
                  )}
                </div>
              )
            )}
          </>
        )}

        {/* Album Details Modal */}
        {selectedAlbum && (
          <MusicAlbumModal
            open={!!selectedAlbum}
            onClose={() => setSelectedAlbum(null)}
            albumTitle={selectedAlbum.title}
            albumArtist={selectedAlbum.artist}
            coverArtUrl={selectedAlbum.thumbUrl}
            year={selectedAlbum.year}
            ratingKey={selectedAlbum.source === 'plex' ? selectedAlbum.ratingKey : null}
            serverId={selectedAlbum.source === 'plex' ? selectedAlbum.serverId : null}
            initialTracks={selectedAlbum.source === 'local' ? selectedAlbumLocalTracks : undefined}
            onPlayAlbum={() => void playAlbumInContext(selectedAlbum, 0)}
            onPlayTrack={(_track, idx) => {
              if (selectedAlbum.source === 'local') {
                void playAlbumInContext(selectedAlbum, idx)
              }
            }}
          />
        )}

        {/* Artist Details Modal */}
        {selectedArtist && (
          <MusicArtistModal
            open={!!selectedArtist}
            onClose={() => setSelectedArtist(null)}
            ratingKey={selectedArtist.source === 'plex' ? selectedArtist.ratingKey : null}
            serverId={selectedArtist.source === 'plex' ? selectedArtist.serverId : null}
            artistName={selectedArtist.name}
            artistThumb={selectedArtist.thumbUrl}
            initialAlbums={selectedArtist.localAlbums}
            initialTracks={selectedArtist.localTracks?.map((t) => ({
              id: t.id,
              title: t.title,
              artist: t.artist,
              albumName: t.albumName,
              trackNumber: t.trackNumber,
              durationMs: t.durationMs,
            }))}
            onSelectAlbum={(alb) => {
              setSelectedAlbum({
                id: `plex-album-${alb.ratingKey}`,
                title: alb.title,
                artist: alb.artist,
                thumbUrl: alb.thumbUrl,
                year: alb.year,
                trackCount: null,
                source: 'plex',
                ratingKey: alb.ratingKey,
                serverId: activeServerId,
              })
            }}
            onPlayArtist={() => void playArtistInContext(selectedArtist, 0)}
            onPlayTrack={(_track, idx) => {
              if (selectedArtist.source === 'local') {
                void playArtistInContext(selectedArtist, idx)
              }
            }}
          />
        )}

        {/* Folders Management Modal */}
        <MusicFoldersModal
          open={isFoldersModalOpen}
          onClose={() => setIsFoldersModalOpen(false)}
          folders={folders}
          onAddFolder={() => void scanDirectory()}
          onRemoveFolder={(id, name) => void removeFolder(id, name)}
          onClearAll={() => void clearLocalLibrary()}
          isScanning={isScanning}
        />

        {/* Queue Drawer */}
        <MusicQueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
      </div>
    </>
  )
}
