import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getAllTracksFromDb,
  getAllFoldersFromDb,
  saveTracksToDb,
  saveFolderToDb,
  deleteFolderFromDb,
  deleteTracksByFolderFromDb,
  clearAllTracksFromDb,
  type StoredLocalTrack,
  type StoredFolder,
} from '../utils/local-music-db'
import {
  scanDirectoryHandle,
  processAudioFiles,
  buildLocalTrackInfo,
  isAudioFile,
} from '../utils/local-scanner'
import { usePlayer } from '@/lib/player/use-player'
import type { LocalTrackInfo } from '@/lib/player/types'

// Module-level file map to preserve active File references for playback during a session
const sessionFileMap = new Map<string, File>()

export const useLocalMusic = () => {
  const { playLocalTrack, playLocalTracks } = usePlayer()
  const [tracks, setTracks] = useState<StoredLocalTrack[]>([])
  const [folders, setFolders] = useState<StoredFolder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null)
  const isMountedRef = useRef(true)
  const activeScanAbortRef = useRef<AbortController | null>(null)

  const reloadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [dbTracks, dbFolders] = await Promise.all([getAllTracksFromDb(), getAllFoldersFromDb()])
      if (isMountedRef.current) {
        setTracks(dbTracks)
        setFolders(dbFolders)
      }
    } catch (err) {
      console.warn('[useLocalMusic] Error loading from DB:', err)
    } finally {
      if (isMountedRef.current) setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    void reloadData()
    return () => {
      isMountedRef.current = false
      activeScanAbortRef.current?.abort()
    }
  }, [reloadData])

  const streamProcessFiles = useCallback(
    async (
      items: { file: File; path: string }[],
      folderName: string,
      handle?: FileSystemDirectoryHandle,
    ) => {
      if (items.length === 0) return

      // Abort any previous in-flight scan
      activeScanAbortRef.current?.abort()
      const controller = new AbortController()
      activeScanAbortRef.current = controller

      setIsScanning(true)
      setScanProgress({ current: 0, total: items.length })

      // Clear previous tracks from IndexedDB for this folder to eliminate orphaned deleted files
      try {
        await deleteTracksByFolderFromDb(folderName)
      } catch (err) {
        console.warn('[useLocalMusic] Error clearing old tracks for folder:', err)
      }

      const folderId = `folder-${folderName.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`
      const folderRecord: StoredFolder = {
        id: folderId,
        name: folderName,
        handle,
        dateAdded: Date.now(),
        trackCount: 0,
      }

      // Add folder to UI immediately so the user sees it and clear prior in-memory tracks for this folder
      setFolders((prev) => {
        const filtered = prev.filter((f) => f.id !== folderId && f.name !== folderName)
        return [...filtered, folderRecord]
      })
      setTracks((prev) => prev.filter((t) => t.folderName !== folderName))

      let pendingTracks: StoredLocalTrack[] = []
      let dbBatch: StoredLocalTrack[] = []
      let flushTimer: ReturnType<typeof setTimeout> | null = null

      const flushTracksToState = () => {
        if (pendingTracks.length === 0) return
        const chunk = [...pendingTracks]
        pendingTracks = []

        if (isMountedRef.current) {
          setTracks((prev) => {
            const existingIds = new Set(prev.map((t) => t.id))
            const newItems = chunk.filter((t) => !existingIds.has(t.id))
            return newItems.length > 0 ? [...prev, ...newItems] : prev
          })
          setFolders((prev) =>
            prev.map((f) =>
              f.id === folderRecord.id
                ? { ...f, trackCount: f.trackCount + chunk.length }
                : f,
            ),
          )
        }
      }

      const onTrackParsed = (track: StoredLocalTrack, file: File) => {
        // Register in session map immediately so the user can play it right away
        sessionFileMap.set(track.id, file)

        pendingTracks.push(track)
        dbBatch.push(track)

        // For the first 3 tracks, flush immediately for instant visual feedback.
        // For remaining tracks, batch every 80ms to keep UI at silky 60fps.
        if (pendingTracks.length <= 3) {
          flushTracksToState()
        } else if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null
            flushTracksToState()
          }, 80)
        }

        // Progressively write to IndexedDB every 20 tracks
        if (dbBatch.length >= 20) {
          const toSave = [...dbBatch]
          dbBatch = []
          void saveTracksToDb(toSave).catch((err) =>
            console.warn('[useLocalMusic] Background save error:', err),
          )
        }
      }

      try {
        const { stored } = await processAudioFiles(items, folderName, {
          concurrency: 3,
          signal: controller.signal,
          onProgress: (curr, tot) => {
            if (isMountedRef.current) {
              setScanProgress({ current: curr, total: tot })
            }
          },
          onTrackParsed,
        })

        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        flushTracksToState()

        // Flush any remaining IndexedDB batch
        if (dbBatch.length > 0) {
          await saveTracksToDb(dbBatch)
        }

        folderRecord.trackCount = stored.length
        await saveFolderToDb(folderRecord)
        const finalFolders = await getAllFoldersFromDb()
        if (isMountedRef.current) {
          setFolders(finalFolders)
        }
      } catch (err) {
        console.warn('[useLocalMusic] Error during audio streaming scan:', err)
      } finally {
        if (isMountedRef.current && activeScanAbortRef.current === controller) {
          setIsScanning(false)
          setScanProgress(null)
          activeScanAbortRef.current = null
        }
      }
    },
    [],
  )

  const importFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const rawFiles = Array.from(fileList)
      const audioFiles = rawFiles.filter((f) => isAudioFile(f.name))
      if (audioFiles.length === 0) return

      const folderName = audioFiles[0]?.webkitRelativePath?.split('/')[0] || 'Imported Music'
      const items = audioFiles.map((f) => ({
        file: f,
        path: f.webkitRelativePath || f.name,
      }))

      await streamProcessFiles(items, folderName)
    },
    [streamProcessFiles],
  )

  const scanDirectory = useCallback(async () => {
    if (typeof window === 'undefined') return
    try {
      // Check for Window File System Access API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ('showDirectoryPicker' in window && typeof (window as any).showDirectoryPicker === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handle: FileSystemDirectoryHandle = await (window as any).showDirectoryPicker({
          mode: 'read',
        })
        if (!handle) return

        // Initialize abort controller before directory handle scanning
        activeScanAbortRef.current?.abort()
        const scanController = new AbortController()
        activeScanAbortRef.current = scanController

        setIsScanning(true)
        setScanProgress({ current: 0, total: 0 })

        const files = await scanDirectoryHandle(
          handle,
          (count) => {
            if (isMountedRef.current) {
              setScanProgress({ current: 0, total: count })
            }
          },
          scanController.signal,
        )

        if (files.length === 0 || scanController.signal.aborted) {
          if (isMountedRef.current && activeScanAbortRef.current === scanController) {
            setIsScanning(false)
            setScanProgress(null)
            activeScanAbortRef.current = null
          }
          return
        }

        await streamProcessFiles(files, handle.name, handle)
      } else {
        // Fallback for browsers without File System Access API: programmatic input
        const input = document.createElement('input')
        input.type = 'file'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(input as any).webkitdirectory = true
        input.multiple = true
        input.onchange = async () => {
          if (!input.files || input.files.length === 0) return
          await importFiles(input.files)
        }
        input.click()
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      console.error('[useLocalMusic] Directory scan failed:', err)
    } finally {
      if (isMountedRef.current && !activeScanAbortRef.current) {
        setIsScanning(false)
        setScanProgress(null)
      }
    }
  }, [streamProcessFiles, importFiles])

  const removeFolder = useCallback(async (folderId: string, folderName: string) => {
    try {
      await deleteFolderFromDb(folderId)
      await deleteTracksByFolderFromDb(folderName)
      await reloadData()
    } catch (err) {
      console.error('[useLocalMusic] Delete folder failed:', err)
    }
  }, [reloadData])

  const clearAll = useCallback(async () => {
    activeScanAbortRef.current?.abort()
    activeScanAbortRef.current = null
    try {
      await clearAllTracksFromDb()
      sessionFileMap.clear()
      await reloadData()
    } catch (err) {
      console.error('[useLocalMusic] Clear all failed:', err)
    }
  }, [reloadData])

  const resolveFileForTrack = useCallback(async (track: StoredLocalTrack): Promise<File | null> => {
    let file = sessionFileMap.get(track.id)
    if (file) return file

    const folder = folders.find((f) => f.name === track.folderName)
    if (folder?.handle) {
      try {
        let perm = 'granted'
        if (typeof folder.handle.queryPermission === 'function') {
          perm = await folder.handle.queryPermission({ mode: 'read' })
        }
        if (perm === 'prompt' && typeof folder.handle.requestPermission === 'function') {
          perm = await folder.handle.requestPermission({ mode: 'read' })
        }
        if (perm === 'granted') {
          let currentDir: FileSystemDirectoryHandle = folder.handle
          const parts = track.path.replace(/\\/g, '/').split('/')
          const relativeParts = parts[0] === folder.name ? parts.slice(1) : parts
          try {
            for (let i = 0; i < relativeParts.length - 1; i++) {
              currentDir = await currentDir.getDirectoryHandle(relativeParts[i])
            }
            const fileName = relativeParts[relativeParts.length - 1] || track.fileName
            const fileHandle = await currentDir.getFileHandle(fileName)
            file = await fileHandle.getFile()
          } catch {
            // Fallback: try top-level file handle if nested directory resolution failed
            const fileHandle = await folder.handle.getFileHandle(track.fileName)
            file = await fileHandle.getFile()
          }
          if (file) {
            sessionFileMap.set(track.id, file)
            return file
          }
        }
      } catch (err) {
        console.warn('[useLocalMusic] Unable to resolve file from folder handle:', err)
      }
    }
    return null
  }, [folders])

  const getPlayableTrack = useCallback((track: StoredLocalTrack): LocalTrackInfo => {
    const file = sessionFileMap.get(track.id)
    return buildLocalTrackInfo(track, file)
  }, [])

  const playTracksInContext = useCallback(
    async (tracksList: StoredLocalTrack[], startIndex = 0) => {
      if (tracksList.length === 0) return
      const playables = await Promise.all(
        tracksList.map(async (t) => {
          let file = sessionFileMap.get(t.id)
          if (!file) {
            file = (await resolveFileForTrack(t)) ?? undefined
          }
          return buildLocalTrackInfo(t, file)
        }),
      )
      await playLocalTracks(playables, startIndex)
    },
    [resolveFileForTrack, playLocalTracks],
  )

  const playTrack = useCallback(async (track: StoredLocalTrack) => {
    let file = sessionFileMap.get(track.id)
    if (!file) {
      file = (await resolveFileForTrack(track)) ?? undefined
    }
    const playable = buildLocalTrackInfo(track, file)
    await playLocalTrack(playable)
  }, [resolveFileForTrack, playLocalTrack])

  const playAll = useCallback(async (startIndex = 0) => {
    await playTracksInContext(tracks, startIndex)
  }, [tracks, playTracksInContext])

  const playAlbum = useCallback(async (albumName: string, startIndex = 0) => {
    const albumTracks = tracks.filter((t) => t.albumName === albumName)
    await playTracksInContext(albumTracks, startIndex)
  }, [tracks, playTracksInContext])

  const playArtist = useCallback(async (artist: string, startIndex = 0) => {
    const artistTracks = tracks.filter((t) => t.artist === artist)
    await playTracksInContext(artistTracks, startIndex)
  }, [tracks, playTracksInContext])

  const artists = useMemo(() => {
    const set = new Set<string>()
    for (const t of tracks) {
      if (t.artist) set.add(t.artist)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [tracks])

  const albums = useMemo(() => {
    type AlbumEntry = {
      albumName: string
      artist: string
      year: string | null
      trackCount: number
      albumArtBlob: Blob | null
    }
    const map = new Map<string, AlbumEntry>()
    for (const t of tracks) {
      const key = `${t.artist}-${t.albumName}`
      const existing = map.get(key)
      if (existing) {
        existing.trackCount++
        if (!existing.albumArtBlob && t.albumArtBlob) existing.albumArtBlob = t.albumArtBlob
      } else {
        map.set(key, {
          albumName: t.albumName,
          artist: t.artist,
          year: t.year,
          trackCount: 1,
          albumArtBlob: t.albumArtBlob,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.albumName.localeCompare(b.albumName))
  }, [tracks])

  return {
    tracks,
    folders,
    artists,
    albums,
    isLoading,
    isScanning,
    scanProgress,
    scanDirectory,
    importFiles,
    removeFolder,
    clearAll,
    playTrack,
    playTracksInContext,
    playAll,
    playAlbum,
    playArtist,
    getPlayableTrack,
    resolveFileForTrack,
  }
}
