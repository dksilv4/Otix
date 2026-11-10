export interface StoredLocalTrack {
  id: string
  title: string
  artist: string
  albumName: string
  trackNumber: number | null
  year: string | null
  durationMs: number
  albumArtBlob: Blob | null
  path: string
  fileName: string
  size: number
  lastModified: number
  folderName: string
}

export interface StoredFolder {
  id: string
  name: string
  handle?: FileSystemDirectoryHandle
  dateAdded: number
  trackCount: number
}

const DB_NAME = 'otix_local_music_db'
const DB_VERSION = 3
const STORE_TRACKS = 'tracks'
const STORE_FOLDERS = 'folders'
const STORE_AUDIO = 'audio_blobs'

let dbInstance: IDBDatabase | null = null

// Memory cache for deduplicated album art blobs across 30k+ tracks
const albumArtCache = new Map<string, Blob>()

export const getCachedAlbumArtBlob = (artist: string, albumName: string): Blob | null => {
  return albumArtCache.get(`${artist}:::${albumName}`) ?? null
}

export const setCachedAlbumArtBlob = (artist: string, albumName: string, blob: Blob): void => {
  albumArtCache.set(`${artist}:::${albumName}`, blob)
}

export const openLocalMusicDb = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance)

  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB not supported in this environment'))
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_TRACKS)) {
        const trackStore = db.createObjectStore(STORE_TRACKS, { keyPath: 'id' })
        trackStore.createIndex('artist', 'artist', { unique: false })
        trackStore.createIndex('albumName', 'albumName', { unique: false })
        trackStore.createIndex('folderName', 'folderName', { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_FOLDERS)) {
        db.createObjectStore(STORE_FOLDERS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO, { keyPath: 'id' })
      }
    }

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result
      resolve(dbInstance)
    }

    request.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error)
    }
  })
}

export const saveTracksToDb = async (tracks: StoredLocalTrack[]): Promise<void> => {
  const db = await openLocalMusicDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite')
    const store = tx.objectStore(STORE_TRACKS)

    for (const track of tracks) {
      if (track.albumArtBlob) {
        const albumKey = `${track.artist}:::${track.albumName}`
        if (!albumArtCache.has(albumKey)) {
          albumArtCache.set(albumKey, track.albumArtBlob)
        }
      }
      store.put(track)
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const getAllTracksFromDb = async (): Promise<StoredLocalTrack[]> => {
  const db = await openLocalMusicDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readonly')
    const store = tx.objectStore(STORE_TRACKS)
    const request = store.getAll()

    request.onsuccess = () => {
      const results: StoredLocalTrack[] = request.result || []
      for (let i = 0; i < results.length; i++) {
        const t = results[i]
        if (t.albumArtBlob) {
          const albumKey = `${t.artist}:::${t.albumName}`
          if (!albumArtCache.has(albumKey)) {
            albumArtCache.set(albumKey, t.albumArtBlob)
          }
        }
      }
      resolve(results)
    }
    request.onerror = () => reject(request.error)
  })
}

export const closeLocalMusicDb = (): void => {
  if (dbInstance) {
    try {
      dbInstance.close()
    } catch {
      // Ignore
    }
    dbInstance = null
  }
}

export const deleteTracksByFolderFromDb = async (folderName: string): Promise<void> => {
  const db = await openLocalMusicDb()
  const hasAudio = db.objectStoreNames.contains(STORE_AUDIO)
  const stores = hasAudio ? [STORE_TRACKS, STORE_AUDIO] : [STORE_TRACKS]
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    const store = tx.objectStore(STORE_TRACKS)
    const audioStore = hasAudio ? tx.objectStore(STORE_AUDIO) : null
    const index = store.index('folderName')
    const request = index.getAllKeys(folderName)

    request.onsuccess = () => {
      const keys = request.result || []
      for (const key of keys) {
        store.delete(key)
        audioStore?.delete(key)
      }
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const getTracksByFolderFromDb = async (folderName: string): Promise<StoredLocalTrack[]> => {
  const db = await openLocalMusicDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readonly')
    const store = tx.objectStore(STORE_TRACKS)
    const index = store.index('folderName')
    const request = index.getAll(folderName)

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

export const clearAllTracksFromDb = async (): Promise<void> => {
  albumArtCache.clear()
  const db = await openLocalMusicDb()
  const stores = [STORE_TRACKS, STORE_FOLDERS]
  if (db.objectStoreNames.contains(STORE_AUDIO)) {
    stores.push(STORE_AUDIO)
  }
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite')
    tx.objectStore(STORE_TRACKS).clear()
    tx.objectStore(STORE_FOLDERS).clear()
    if (db.objectStoreNames.contains(STORE_AUDIO)) {
      tx.objectStore(STORE_AUDIO).clear()
    }
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export interface StoredAudioBlobRecord {
  id: string
  blob: Blob
}

export const saveAudioBlobToDb = async (id: string, blob: Blob): Promise<void> => {
  const db = await openLocalMusicDb()
  if (!db.objectStoreNames.contains(STORE_AUDIO)) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, 'readwrite')
    const store = tx.objectStore(STORE_AUDIO)
    store.put({ id, blob })
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const getAudioBlobFromDb = async (id: string): Promise<Blob | null> => {
  const db = await openLocalMusicDb()
  if (!db.objectStoreNames.contains(STORE_AUDIO)) return null
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, 'readonly')
    const store = tx.objectStore(STORE_AUDIO)
    const request = store.get(id)
    request.onsuccess = () => {
      const result = request.result as StoredAudioBlobRecord | undefined
      resolve(result?.blob ?? null)
    }
    request.onerror = () => reject(request.error)
  })
}

export const deleteAudioBlobFromDb = async (id: string): Promise<void> => {
  const db = await openLocalMusicDb()
  if (!db.objectStoreNames.contains(STORE_AUDIO)) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, 'readwrite')
    tx.objectStore(STORE_AUDIO).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const clearAllAudioBlobsFromDb = async (): Promise<void> => {
  const db = await openLocalMusicDb()
  if (!db.objectStoreNames.contains(STORE_AUDIO)) return
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_AUDIO, 'readwrite')
    tx.objectStore(STORE_AUDIO).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const saveFolderToDb = async (folder: StoredFolder): Promise<void> => {
  const db = await openLocalMusicDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, 'readwrite')
    tx.objectStore(STORE_FOLDERS).put(folder)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const getAllFoldersFromDb = async (): Promise<StoredFolder[]> => {
  const db = await openLocalMusicDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, 'readonly')
    const request = tx.objectStore(STORE_FOLDERS).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

export const deleteFolderFromDb = async (folderId: string): Promise<void> => {
  const db = await openLocalMusicDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FOLDERS, 'readwrite')
    tx.objectStore(STORE_FOLDERS).delete(folderId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
