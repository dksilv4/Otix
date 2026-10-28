export { extractModalMessage } from '@/lib/utils/format-error'

export const cleanEpicCode = (input: string): string => {
  const trimmed = input.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed)
      const code = url.searchParams.get('code') || url.searchParams.get('authorizationCode')
      if (code) return code.trim()
    } catch {
      // not a valid url, fallback to trimmed input
    }
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { authorizationCode?: unknown }
      if (parsed.authorizationCode && typeof parsed.authorizationCode === 'string') {
        return parsed.authorizationCode.trim()
      }
    } catch {
      // not valid json, fallback to trimmed input
    }
  }
  return trimmed
}

export const cleanGOGCode = (input: string): string => {
  const trimmed = input.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed)
      const code = url.searchParams.get('code') || url.searchParams.get('authorizationCode')
      if (code) return code.trim()
    } catch {
      // not a valid url, fallback to trimmed input
    }
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { code?: unknown; authorizationCode?: unknown }
      if (parsed.code && typeof parsed.code === 'string') {
        return parsed.code.trim()
      }
      if (parsed.authorizationCode && typeof parsed.authorizationCode === 'string') {
        return parsed.authorizationCode.trim()
      }
    } catch {
      // not valid json, fallback to trimmed input
    }
  }
  return trimmed
}
