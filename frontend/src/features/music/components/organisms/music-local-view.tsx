import { useState, useMemo } from 'react'
import { FolderPlus, Folder, Trash2, Search, Play, Disc3, Mic2, Music, Loader2 } from 'lucide-react'
import { useLocalMusic } from '../../local/hooks/use-local-music'
import { MusicCard } from '../molecules/music-card'
import { MusicTrackRow } from '../molecules/music-track-row'
import { MusicAlbumModal, type AlbumTrackItem } from './music-album-modal'
import { usePlayer } from '@/lib/player/use-player'

type LocalViewMode = 'albums' | 'artists' | 'tracks'

interface SelectedLocalAlbumState {
  albumName: string
  artist: string
  coverArtUrl: string | null
  year: string | number | null
  tracks: AlbumTrackItem[]
}

export const MusicLocalView = () => {
  const {
    tracks,
    folders,
    albums,
    artists,
    isLoading,
    isScanning,
    scanProgress,
    scanDirectory,
    removeFolder,
    clearAll,
    playTrack,
    playAll,
    playAlbum,
    playArtist,
    getPlayableTrack,
  } = useLocalMusic()

  const { currentTrack, isPlaying } = usePlayer()
  const [viewMode, setViewMode] = useState<LocalViewMode>('albums')
  const [query, setQuery] = useState('')
  const [selectedAlbum, setSelectedAlbum] = useState<SelectedLocalAlbumState | null>(null)

  const filteredAlbums = useMemo(() => {
    if (!query.trim()) return albums
    const q = query.toLowerCase()
    return albums.filter(
      (a) => a.albumName.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q),
    )
  }, [albums, query])

  const filteredArtists = useMemo(() => {
    if (!query.trim()) return artists
    const q = query.toLowerCase()
    return artists.filter((a) => a.toLowerCase().includes(q))
  }, [artists, query])

  const filteredTracks = useMemo(() => {
    if (!query.trim()) return tracks
    const q = query.toLowerCase()
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.albumName.toLowerCase().includes(q),
    )
  }, [tracks, query])

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Folder management toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 bg-[var(--dk-surface-raised)] border border-white/[0.04]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void scanDirectory()}
            disabled={isScanning}
            className="flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            {isScanning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Scanning files...</span>
              </>
            ) : (
              <>
                <FolderPlus className="h-4 w-4" />
                <span>Add Music Folder</span>
              </>
            )}
          </button>

          {tracks.length > 0 && (
            <button
              type="button"
              onClick={() => void playAll()}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] px-3 py-2 text-xs font-medium text-foreground transition-colors cursor-pointer"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              <span>Play All</span>
            </button>
          )}

          {/* List of scanned folders */}
          {folders.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-glass)] px-3 py-1.5 text-xs text-muted-foreground border border-white/[0.04]"
            >
              <Folder className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium text-foreground">{f.name}</span>
              <span className="text-[11px]">({f.trackCount})</span>
              <button
                type="button"
                onClick={() => void removeFolder(f.id, f.name)}
                className="ml-1 text-muted-foreground hover:text-destructive transition-colors p-0.5"
                title="Remove folder"
                aria-label={`Remove folder ${f.name}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>

        {folders.length > 0 && (
          <button
            type="button"
            onClick={() => void clearAll()}
            className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            <span>Clear Library</span>
          </button>
        )}
      </div>

      {/* Progress banner */}
      {isScanning && scanProgress && (
        <div className="flex flex-col gap-1.5 rounded-xl bg-[var(--dk-surface-raised)] p-3 text-xs text-muted-foreground">
          <div className="flex justify-between font-mono">
            <span>Scanning audio files...</span>
            <span>{scanProgress.current} / {scanProgress.total}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--dk-surface-raised)]">
            <div
              className="h-full bg-primary transition-all duration-150"
              style={{
                width: `${scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Controls: view pills + search */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center rounded-xl bg-[var(--dk-surface-raised)] p-1 border border-white/[0.04]">
          <button
            type="button"
            onClick={() => setViewMode('albums')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              viewMode === 'albums'
                ? 'bg-[var(--dk-surface-glass-hover)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Disc3 className="h-3.5 w-3.5" />
            <span>Albums ({albums.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('artists')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              viewMode === 'artists'
                ? 'bg-[var(--dk-surface-glass-hover)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Mic2 className="h-3.5 w-3.5" />
            <span>Artists ({artists.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('tracks')}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
              viewMode === 'tracks'
                ? 'bg-[var(--dk-surface-glass-hover)] text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Music className="h-3.5 w-3.5" />
            <span>Tracks ({tracks.length})</span>
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${viewMode}...`}
            className="w-full rounded-xl bg-[var(--dk-surface-raised)] border border-white/[0.04] py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40 transition-colors"
          />
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl py-16 px-4 text-center border border-white/[0.04] bg-[var(--dk-surface-raised)]/40">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-glass)] text-muted-foreground">
            {isScanning ? (
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            ) : (
              <Disc3 className="h-8 w-8 stroke-[1.5]" />
            )}
          </div>
          <h3 className="text-base font-semibold text-foreground">
            {isScanning ? 'Importing songs in real time...' : 'No local music added'}
          </h3>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            {isScanning
              ? 'Reading audio tags and album art. Songs will appear below as they are scanned.'
              : 'Click "Add Music Folder" above or drag & drop audio files anywhere into Otix to add to your library and start playing.'}
          </p>
        </div>
      ) : (
        <>
          {viewMode === 'albums' && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredAlbums.map((album) => {
                let artUrl: string | null = null
                if (album.albumArtBlob) {
                  try {
                    artUrl = URL.createObjectURL(album.albumArtBlob)
                  } catch {
                    // Ignore object URL creation error
                  }
                }
                return (
                  <MusicCard
                    key={`${album.artist}-${album.albumName}`}
                    title={album.albumName}
                    subtitle={album.artist}
                    imageUrl={artUrl}
                    year={album.year}
                    trackCount={album.trackCount}
                    onClick={() => {
                      const albumTracks = tracks
                        .filter((t) => t.albumName === album.albumName)
                        .map((t) => ({
                          id: t.id,
                          title: t.title,
                          artist: t.artist,
                          trackNumber: t.trackNumber,
                          durationMs: t.durationMs,
                        }))
                      setSelectedAlbum({
                        albumName: album.albumName,
                        artist: album.artist,
                        coverArtUrl: artUrl,
                        year: album.year,
                        tracks: albumTracks,
                      })
                    }}
                    onPlay={() => void playAlbum(album.albumName)}
                  />
                )
              })}
            </div>
          )}

          {viewMode === 'artists' && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {filteredArtists.map((artistName) => (
                <MusicCard
                  key={artistName}
                  title={artistName}
                  subtitle="Artist"
                  onPlay={() => void playArtist(artistName)}
                />
              ))}
            </div>
          )}

          {viewMode === 'tracks' && (
            <div className="flex flex-col rounded-2xl p-2 bg-[var(--dk-surface-raised)] border border-white/[0.04]">
              {filteredTracks.map((track, idx) => {
                const playable = getPlayableTrack(track)
                const isThisActive = currentTrack?.id === track.id
                return (
                  <MusicTrackRow
                    key={track.id}
                    index={idx}
                    trackNumber={track.trackNumber}
                    title={track.title}
                    artist={track.artist}
                    albumName={track.albumName}
                    durationMs={track.durationMs}
                    coverArtUrl={playable.albumArt}
                    isActive={isThisActive}
                    isPlaying={isPlaying && isThisActive}
                    onPlay={() => void playTrack(track)}
                  />
                )
              })}
            </div>
          )}
        </>
      )}

      {selectedAlbum && (
        <MusicAlbumModal
          open={!!selectedAlbum}
          onClose={() => setSelectedAlbum(null)}
          albumTitle={selectedAlbum.albumName}
          albumArtist={selectedAlbum.artist}
          coverArtUrl={selectedAlbum.coverArtUrl}
          year={selectedAlbum.year}
          initialTracks={selectedAlbum.tracks}
          onPlayAlbum={() => {
            void playAlbum(selectedAlbum.albumName)
          }}
          onPlayTrack={(t) => {
            const rawTrack = tracks.find((tr) => tr.id === t.id)
            if (rawTrack) {
              void playTrack(rawTrack)
            }
          }}
        />
      )}
    </div>
  )
}
