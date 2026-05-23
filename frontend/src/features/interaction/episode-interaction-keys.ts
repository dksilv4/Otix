export const episodeInteractionKeys = {
  all: () => ['episode-interactions'] as const,
  forShow: (mediaId: string) => [...episodeInteractionKeys.all(), 'show', mediaId] as const,
}
