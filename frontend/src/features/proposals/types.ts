export interface MatchProposal {
  id: number | string
  source: string
  sourceGameId: string
  sourceTitle: string
  developer: string | null
  releaseYear: number | null
  posterUrl: string | null
  otixMediaId: string
  otixTitle: string
  otixPosterUrl: string | null
  otixReleaseYear: number | null
  otixConfidence: number
  matchType: string
  status: string
  proposedBy: string
  proposerAvatar: string | null
  proposerXp: number
  createdAt: string
}

export interface MatchProposalList {
  proposals: MatchProposal[]
  total: number
}
