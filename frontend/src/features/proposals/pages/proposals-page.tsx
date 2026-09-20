import { useEffect, useState, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, Gamepad2, ExternalLink, Star, ArrowRight } from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { DkButton } from '@ui/atoms/button'
import { SettingsCard } from '@/features/settings/components/molecules/settings-card'
import { SectionHeader } from '@/features/settings/components/molecules/settings-section-header'

interface MatchProposal {
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

interface MatchProposalList {
  proposals: MatchProposal[]
  total: number
}

function confidenceColor(c: number) {
  if (c >= 0.95) return 'text-green-400 bg-green-500/10'
  if (c >= 0.85) return 'text-blue-400 bg-blue-500/10'
  if (c >= 0.75) return 'text-amber-400 bg-amber-500/10'
  return 'text-white/40 bg-white/5'
}

export function ProposalsPage() {
  const [proposals, setProposals] = useState<MatchProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('pending')
  const [acting, setActing] = useState<string | number | null>(null)
  const [stats, setStats] = useState({ pending: 0, total: 0 })

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data }, pendingRes] = await Promise.all([
        apiClient.get<MatchProposalList>('/media/admin/match-proposals', {
          params: { status: filter, limit: 100 },
        }),
        apiClient
          .get<MatchProposalList>('/media/admin/match-proposals', {
            params: { status: 'pending', limit: 1 },
          })
          .catch(() => null),
      ])

      setProposals(data.proposals || [])
      setStats({
        total: data.total ?? data.proposals?.length ?? 0,
        pending: pendingRes?.data?.total ?? (filter === 'pending' ? data.total ?? 0 : 0),
      })
    } catch (err: any) {
      const status = err?.response?.status
      setError(status ? `HTTP ${status}` : err?.message || 'Failed to load proposals')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchProposals()
  }, [fetchProposals])

  const handleAction = async (id: string | number, action: 'approve' | 'reject') => {
    setActing(id)
    try {
      await apiClient.post(`/media/admin/match-proposals/${id}/${action}`)
      setProposals((p) => p.filter((x) => x.id !== id))
      if (filter === 'pending') {
        setStats((s) => ({
          ...s,
          pending: Math.max(0, s.pending - 1),
          total: Math.max(0, s.total - 1),
        }))
      }
    } catch (err) {
      console.error(action, err)
    } finally {
      setActing(null)
    }
  }

  return (
    <SettingsCard>
      <SectionHeader
        title="Match Proposals"
        description={`${stats.pending} pending · ${proposals.length} ${filter}`}
        action={
          <div className="flex gap-1">
            {['pending', 'approved', 'rejected'].map((f) => (
              <DkButton
                key={f}
                size="sm"
                variant={filter === f ? 'primary' : 'ghost'}
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
              </DkButton>
            ))}
          </div>
        }
      />

      {error && (
        <div className="rounded-xl p-4 mb-4 bg-red-500/5">
          <p className="text-xs text-red-400">{error}</p>
          <DkButton size="sm" variant="ghost" onClick={fetchProposals} className="mt-1 text-red-300">
            Retry
          </DkButton>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      )}

      {!loading && !error && proposals.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Star className="h-10 w-10 text-white/20" />
          <p className="text-sm text-white/40">No {filter} proposals</p>
          <p className="text-xs text-white/30">Scan a game library to generate match proposals</p>
        </div>
      )}

      <div className="space-y-3">
        {proposals.map((p) => (
          <div key={p.id} className="rounded-xl bg-white/[0.03] p-4">
            <div className="flex items-stretch gap-4">
              <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
                <div className="w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-white/5">
                  {p.posterUrl ? (
                    <img src={p.posterUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Gamepad2 className="h-8 w-8 text-white/10" />
                    </div>
                  )}
                </div>
                <div className="text-center min-w-0 w-full">
                  <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-white/40">
                    {p.source}
                  </span>
                  <p className="text-xs font-medium text-white mt-1 truncate">{p.sourceTitle}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {[p.releaseYear, p.developer].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-center justify-center gap-1.5">
                <div className={`text-center px-2 py-1 rounded-lg ${confidenceColor(p.otixConfidence)}`}>
                  <p className="text-sm font-bold">{Math.round(p.otixConfidence * 100)}%</p>
                  <p className="text-[8px] opacity-60">{p.matchType}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-white/20" />
              </div>

              <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
                <div className="w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-white/5">
                  {p.otixPosterUrl ? (
                    <img src={p.otixPosterUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Gamepad2 className="h-8 w-8 text-white/10" />
                    </div>
                  )}
                </div>
                <div className="text-center min-w-0 w-full">
                  <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                    Otix
                  </span>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <p className="text-xs font-medium text-green-400/90 truncate">{p.otixTitle}</p>
                    <a
                      href={`/media/game/${p.otixMediaId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-0.5 rounded text-white/15 hover:text-white/40 transition-colors shrink-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {p.otixReleaseYear ? `${p.otixReleaseYear}` : '—'}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {p.status === 'pending' && (
                  <>
                    <DkButton
                      size="sm"
                      onClick={() => handleAction(p.id, 'approve')}
                      disabled={!!acting}
                      className="bg-green-500/15 text-green-400 hover:bg-green-500/25"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Accept
                    </DkButton>
                    <DkButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleAction(p.id, 'reject')}
                      disabled={!!acting}
                      className="text-white/30 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <XCircle className="h-4 w-4" />
                    </DkButton>
                  </>
                )}
                {p.status === 'approved' && (
                  <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                  </span>
                )}
                {p.status === 'rejected' && (
                  <span className="text-xs text-red-400/60 font-medium flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" /> Rejected — skipped on future scans
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SettingsCard>
  )
}
