export const formatTrackDuration = (ms: number | null | undefined): string => {
  if (!ms || isNaN(ms) || ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export const formatTrackCount = (count: number | null | undefined): string => {
  if (!count) return '0 tracks'
  return count === 1 ? '1 track' : `${count} tracks`
}

export const formatTotalAlbumDuration = (tracks: Array<{ durationMs?: number | null }>): string => {
  const totalMs = tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0)
  if (totalMs <= 0) return ''
  const totalMinutes = Math.floor(totalMs / 60000)
  if (totalMinutes < 60) {
    return `${totalMinutes} min`
  }
  const hours = Math.floor(totalMinutes / 60)
  const remainingMins = totalMinutes % 60
  return `${hours} hr ${remainingMins} min`
}
