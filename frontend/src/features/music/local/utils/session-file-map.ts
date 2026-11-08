/**
 * Module-level session file map to preserve active File references for playback during a session.
 */
const sessionFileMap = new Map<string, File>()

export const setSessionFile = (id: string, file: File): void => {
  sessionFileMap.set(id, file)
}

export const getSessionFile = (id: string): File | undefined => {
  return sessionFileMap.get(id)
}

export const deleteSessionFile = (id: string): boolean => {
  return sessionFileMap.delete(id)
}

export const clearSessionFiles = (): void => {
  sessionFileMap.clear()
}

export const getAllSessionFiles = (): Map<string, File> => {
  return sessionFileMap
}
