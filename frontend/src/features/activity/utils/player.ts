export interface PersonListResponse {
  items: Array<{ id: string; name: string }>
}

export interface QueueTrackView {
  uri?: string
  id?: string
  albumArt?: string
  name?: string
  title?: string
  artist?: string
}

export const normalizeTrack = (t: {
  id?: string
  uri?: string
  albumArt?: string | null
  name?: string
  title?: string
  artist?: string
}): QueueTrackView => {
  const { albumArt, ...rest } = t
  return { ...rest, albumArt: albumArt ?? undefined }
}
