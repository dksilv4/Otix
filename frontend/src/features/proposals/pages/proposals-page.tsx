import { useEffect, useState, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, Gamepad2, ExternalLink, Star, ArrowRight } from 'lucide-react'
import { ACCESS_TOKEN_KEY } from '@/lib/config'
import { isDesktop } from '@/lib/desktop/api'
import { DkButton } from '@ui/atoms/button'
import { SettingsCard } from '@/features/settings/components/molecules/settings-card'
import { SectionHeader } from '@/features/settings/components/molecules/settings-section-header'

interface Proposal {
  id: string
  source: string
  source_game_id: string
  source_title: string
  developer: string | null
  release_year: number | null
  poster_url: string | null
  otix_media_id: string
  otix_title: string
  otix_poster_url: string | null
  otix_release_year: number | null
  otix_confidence: number
  match_type: string
  status: string
  proposed_by: string
  proposer_avatar: string | null
  proposer_xp: number
  created_at: string
}

function getApiBase() {
  if (isDesktop()) {
    return (window as any).desktopAPI?.getApiBaseUrl?.() || 'http://127.0.0.1:8000/api/v1'
  }
  return ''
}

function confidenceColor(c: number) {
  if (c >= 0.95) return 'text-green-400 bg-green-500/10'
  if (c >= 0.85) return 'text-blue-400 bg-blue-500/10'
  if (c >= 0.75) return 'text-amber-400 bg-amber-500/10'
  return 'text-white/40 bg-white/5'
}

export function ProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('pending')
  const [acting, setActing] = useState<string | null>(null)
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 })

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem('otix_access_token')
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const base = getApiBase()
      const [filteredRes, totalRes] = await Promise.all([
        fetch(`${base}/media/admin/match-proposals?status=${filter}&limit=100`, { headers }),
        fetch(`${base}/media/admin/match-proposals?status=pending&limit=1`, { headers }).catch(() => null),
      ])

      if (!filteredRes.ok) throw new Error(`HTTP ${filteredRes.status}`)
      const data = await filteredRes.json()
      setProposals(data.proposals || data.items || [])

      if (totalRes?.ok) {
        const t = await totalRes.json()
        setStats({
          total: t.total || data.length,
          pending: t.total || 0,
          approved: 0,
          rejected: 0,
        })
      } else {
        setStats({ total: data.total || 0, pending: data.total || 0, approved: 0, rejected: 0 })
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load proposals')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { fetchProposals() }, [fetchProposals])

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActing(id)
    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem('otix_access_token')
      const headers: Record<string, string> = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      await fetch(`${getApiBase()}/media/admin/match-proposals/${id}/${action}`, { method: 'POST', headers })
      setProposals((p) => p.filter((x) => x.id !== id))
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
        description={`${stats.total} total · ${proposals.length} ${filter}`}
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
                  {p.poster_url
                    ? <img src={p.poster_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Gamepad2 className="h-8 w-8 text-white/10" /></div>}
                </div>
                <div className="text-center min-w-0 w-full">
                  <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-white/40">{p.source}</span>
                  <p className="text-xs font-medium text-white mt-1 truncate">{p.source_title}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {[p.release_year, p.developer].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-center justify-center gap-1.5">
                <div className={`text-center px-2 py-1 rounded-lg ${confidenceColor(p.otix_confidence)}`}>
                  <p className="text-sm font-bold">{Math.round(p.otix_confidence * 100)}%</p>
                  <p className="text-[8px] opacity-60">{p.match_type}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-white/20" />
              </div>

              <div className="flex-1 min-w-0 flex flex-col items-center gap-2">
                <div className="w-24 h-32 shrink-0 rounded-lg overflow-hidden bg-white/5">
                  {p.otix_poster_url
                    ? <img src={p.otix_poster_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center"><Gamepad2 className="h-8 w-8 text-white/10" /></div>}
                </div>
                <div className="text-center min-w-0 w-full">
                  <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">Otix</span>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <p className="text-xs font-medium text-green-400/90 truncate">{p.otix_title}</p>
                    <a href={`/media/game/${p.otix_media_id}`} target="_blank" rel="noopener noreferrer"
                      className="p-0.5 rounded text-white/15 hover:text-white/40 transition-colors shrink-0">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <p className="text-[10px] text-white/30 mt-0.5">
                    {p.otix_release_year ? `${p.otix_release_year}` : '—'}
                  </p>
                </div>
              </div>

              <div className="shrink-0 flex items-center gap-2">
                {p.status === 'pending' && (
                  <>
                    <DkButton size="sm" onClick={() => handleAction(p.id, 'approve')} disabled={!!acting}
                      className="bg-green-500/15 text-green-400 hover:bg-green-500/25">
                      <CheckCircle2 className="h-4 w-4" /> Accept
                    </DkButton>
                    <DkButton size="sm" variant="ghost" onClick={() => handleAction(p.id, 'reject')} disabled={!!acting}
                      className="text-white/30 hover:text-red-400 hover:bg-red-500/10">
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
