export interface ExtractedDroppedItem {
  file: File
  path: string
  folderName?: string
}

export const getFileNativePath = (file: File): string => {
  if (typeof window !== 'undefined') {
    const desktopApi = (window as any).desktopAPI
    if (desktopApi?.getPathForFile && typeof desktopApi.getPathForFile === 'function') {
      try {
        const p = desktopApi.getPathForFile(file)
        if (p) return p
      } catch {
        // Fall through
      }
    }
  }
  return (file as any).path || ''
}

const isAbsoluteDiskPath = (p: string): boolean => {
  return /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(p)
}

const traverseEntry = async (
  entry: any,
  currentPath: string,
  out: ExtractedDroppedItem[],
  nativePaths?: Map<string, string>,
): Promise<void> => {
  if (!entry) return

  if (entry.isFile) {
    await new Promise<void>((resolve) => {
      entry.file(
        (file: File) => {
          let electronPath = getFileNativePath(file)
          if (!electronPath && nativePaths?.has(file.name)) {
            electronPath = nativePaths.get(file.name)!
          }
          if (!electronPath && currentPath && isAbsoluteDiskPath(currentPath)) {
            electronPath = `${currentPath}/${file.name}`
          }
          const fullPath = electronPath || (currentPath ? `${currentPath}/${file.name}` : file.name)
          const folderName = currentPath
            ? currentPath.replace(/\\/g, '/').split('/').filter(Boolean)[0]
            : undefined
          out.push({ file, path: fullPath, folderName })
          resolve()
        },
        (err: unknown) => {
          console.warn('[drop-extractor] Could not read dropped file entry:', entry.name, err)
          resolve()
        },
      )
    })
  } else if (entry.isDirectory) {
    const nextPath = currentPath
      ? `${currentPath}/${entry.name}`
      : (nativePaths?.get(entry.name) || entry.name)
    try {
      const dirReader = entry.createReader()
      const readAllEntries = async (): Promise<any[]> => {
        const all: any[] = []
        let batch: any[] = []
        do {
          batch = await new Promise<any[]>((resolve) => {
            dirReader.readEntries(
              (entries: any[]) => resolve(entries || []),
              (err: unknown) => {
                console.warn('[drop-extractor] Directory read error:', entry.name, err)
                resolve([])
              },
            )
          })
          all.push(...batch)
        } while (batch.length > 0)
        return all
      }

      const children = await readAllEntries()
      for (const child of children) {
        await traverseEntry(child, nextPath, out, nativePaths)
      }
    } catch (err) {
      console.warn('[drop-extractor] Skipped directory entry:', entry.name, err)
    }
  }
}

/**
 * Extracts all files from a DataTransfer event, expanding directories recursively
 * when webkitGetAsEntry is available, or falling back to dataTransfer.files.
 */
export const extractFilesFromDataTransfer = async (
  dataTransfer: DataTransfer,
): Promise<ExtractedDroppedItem[]> => {
  const results: ExtractedDroppedItem[] = []

  // Pre-index native paths from top-level DataTransfer files (vital for Electron 30+)
  const nativePaths = new Map<string, string>()
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i]
      const nativePath = getFileNativePath(file)
      if (nativePath) {
        nativePaths.set(file.name, nativePath)
      }
    }
  }

  // Check if webkitGetAsEntry is available on items
  if (dataTransfer.items && dataTransfer.items.length > 0) {
    const firstItem = dataTransfer.items[0]
    if (typeof firstItem.webkitGetAsEntry === 'function') {
      const entries: any[] = []
      for (let i = 0; i < dataTransfer.items.length; i++) {
        try {
          const entry = dataTransfer.items[i].webkitGetAsEntry()
          if (entry) entries.push(entry)
        } catch (e) {
          console.warn('[drop-extractor] Could not get entry from item:', e)
        }
      }

      if (entries.length > 0) {
        for (const entry of entries) {
          const rootPath = nativePaths.get(entry.name) || ''
          await traverseEntry(entry, rootPath, results, nativePaths)
        }
        return results
      }
    }
  }

  // Fallback to dataTransfer.files
  if (dataTransfer.files && dataTransfer.files.length > 0) {
    for (let i = 0; i < dataTransfer.files.length; i++) {
      const file = dataTransfer.files[i]
      const electronPath = getFileNativePath(file)
      const relativePath = electronPath || file.webkitRelativePath || file.name
      const folderName = file.webkitRelativePath ? file.webkitRelativePath.split('/')[0] : undefined
      results.push({
        file,
        path: relativePath,
        folderName,
      })
    }
  }

  return results
}
