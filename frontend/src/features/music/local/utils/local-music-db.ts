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
const DB_VERSION = 1
const STORE_TRACKS = 'tracks'
const STORE_FOLDERS = 'folders'

let dbInstance: IDBDatabase | null = null

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

    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
}

export const deleteTracksByFolderFromDb = async (folderName: string): Promise<void> => {
  const db = await openLocalMusicDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_TRACKS, 'readwrite')
    const store = tx.objectStore(STORE_TRACKS)
    const index = store.index('folderName')
    const request = index.getAllKeys(folderName)

    request.onsuccess = () => {
      const keys = request.result || []
      for (const key of keys) {
        store.delete(key)
      }
    }

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export const clearAllTracksFromDb = async (): Promise<void> => {
  const db = await openLocalMusicDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_TRACKS, STORE_FOLDERS], 'readwrite')
    tx.objectStore(STORE_TRACKS).clear()
    tx.objectStore(STORE_FOLDERS).clear()
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
