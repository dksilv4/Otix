// TODO: Review this file
export const reviewKeys = {
  all: () => ['reviews'] as const,
  myReview: (mediaId: string) => [...reviewKeys.all(), 'my', mediaId] as const,
  list: (mediaId: string) => [...reviewKeys.all(), 'list', mediaId] as const,
}
