export const interactionKeys = {
  all: () => ['interactions'] as const,
  forMedia: (mediaId: string) => [...interactionKeys.all(), 'media', mediaId] as const,
}
