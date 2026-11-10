import {
  isAudioFile,
  processAudioFiles,
  buildLocalTrackInfo,
} from '@/features/music/local/utils/local-scanner'
import {
  saveTracksToDb,
  saveFolderToDb,
  saveAudioBlobToDb,
  type StoredLocalTrack,
  type StoredFolder,
} from '@/features/music/local/utils/local-music-db'
import { setSessionFile } from '@/features/music/local/utils/session-file-map'
import type { LocalTrackInfo } from '@/lib/player/types'
import { showToast } from '@ui/molecules/toast'
import type { ExtractedDroppedItem } from './drop-extractor'

export interface DropMusicHandlerResult {
  success: boolean
  audioCount: number
  storedTracks?: StoredLocalTrack[]
  folder?: StoredFolder
  reason?: string
}

export interface HandleDroppedMusicOptions {
  autoPlay?: boolean
  folderName?: string
  onProgress?: (current: number, total: number) => void
}

export const handleDroppedMusic = async (
  items: ExtractedDroppedItem[],
  playLocalTracks: (tracks: LocalTrackInfo[], startIndex?: number) => Promise<void>,
  options?: HandleDroppedMusicOptions,
): Promise<DropMusicHandlerResult> => {
  if (!items || items.length === 0) {
    return { success: false, audioCount: 0, reason: 'empty-drop' }
  }

  const audioItems = items.filter((item) => isAudioFile(item.file.name))

  if (audioItems.length === 0) {
    showToast({
      title: 'No audio files found',
      description: 'Otix supports MP3, FLAC, WAV, M4A, AAC, OGG, OPUS, and WMA audio.',
      variant: 'warning',
    })
    return { success: false, audioCount: 0, reason: 'no-audio-files' }
  }

  // Derive an appropriate folder name for the dropped music
  let targetFolderName = options?.folderName
  if (!targetFolderName) {
    const definedFolder = audioItems.find((i) => Boolean(i.folderName))?.folderName
    if (definedFolder) {
      targetFolderName = definedFolder
    } else if (audioItems[0].path.includes('/')) {
      targetFolderName = audioItems[0].path.split('/')[0]
    } else if (audioItems.length === 1) {
      targetFolderName = 'Dropped Music'
    } else {
      targetFolderName = 'Imported Music'
    }
  }

  const folderId = `folder-${targetFolderName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`

  // Process audio files with metadata extraction
  const { stored, liveMap } = await processAudioFiles(
    audioItems.map((item) => ({ file: item.file, path: item.path })),
    targetFolderName,
    {
      concurrency: 3,
      onProgress: options?.onProgress,
      onTrackParsed: (storedTrack, file) => {
        setSessionFile(storedTrack.id, file)
        void saveAudioBlobToDb(storedTrack.id, file).catch(() => {})
      },
    },
  )

  if (stored.length === 0) {
    showToast({
      title: 'Import failed',
      description: 'Could not parse audio metadata from dropped files.',
      variant: 'error',
    })
    return { success: false, audioCount: 0, reason: 'parsing-failed' }
  }

  // Save tracks to IndexedDB
  await saveTracksToDb(stored)

  // Save/update folder record
  const folderRecord: StoredFolder = {
    id: folderId,
    name: targetFolderName,
    dateAdded: Date.now(),
    trackCount: stored.length,
  }
  await saveFolderToDb(folderRecord)

  // Notify active views across Otix
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('otix:local-music-updated', {
        detail: { folderId, count: stored.length },
      }),
    )
  }

  // Build playable tracks
  const playableTracks: LocalTrackInfo[] = stored.map((t) => {
    const file = liveMap.get(t.id)
    return buildLocalTrackInfo(t, file)
  })

  // Start playback immediately if autoPlay is true (default true)
  if (options?.autoPlay !== false && playableTracks.length > 0) {
    try {
      await playLocalTracks(playableTracks, 0)
    } catch {
      // Autoplay blocked by browser policy; engine transitions to paused so user click starts playback
    }
  }

  // Success toast notification
  const firstTrack = stored[0]
  if (stored.length === 1) {
    showToast({
      title: `Playing "${firstTrack.title}"`,
      description: 'Added to your local music library',
      variant: 'success',
    })
  } else {
    showToast({
      title: `Playing "${firstTrack.title}"`,
      description: `Added ${stored.length} tracks to "${targetFolderName}"`,
      variant: 'success',
    })
  }

  return {
    success: true,
    audioCount: stored.length,
    storedTracks: stored,
    folder: folderRecord,
  }
}
