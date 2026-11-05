/** Normalize Windows / POSIX path slashes to standard forward slashes without trailing slashes. */
export const normalizePathSeparators = (pathStr?: string | null): string => {
  if (!pathStr) return ''
  return pathStr.replace(/\\+/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '')
}

/** Extract filename from path. */
export const extractPathFilename = (pathStr?: string | null): string => {
  const norm = normalizePathSeparators(pathStr)
  if (!norm) return ''
  const idx = norm.lastIndexOf('/')
  return idx >= 0 ? norm.slice(idx + 1) : norm
}
