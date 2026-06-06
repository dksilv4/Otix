// TODO: Review this file
export const adminEditKeys = {
  all: () => ['admin', 'edits'] as const,
  forMedia: (mediaId: string) => [...adminEditKeys.all(), 'media', mediaId] as const,
  pending: () => [...adminEditKeys.all(), 'pending'] as const,
  allProposals: (filters?: { status?: string; limit?: number; offset?: number }) =>
    [...adminEditKeys.all(), 'all-proposals', filters] as const,
}
