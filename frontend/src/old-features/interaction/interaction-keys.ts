// TODO: Review this file
export const interactionKeys = {
  all: () => ['interactions'] as const,
  forMedia: (mediaType: string, mediaId: string) => [...interactionKeys.all(), 'media', mediaType, mediaId] as const,
}
