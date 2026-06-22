import { useEffect, useState, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, ArrowLeft, Gamepad2, ExternalLink } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api/client'

interface Proposal {
  id: string
  source: string
  source_game_id: string
  source_title: string
  developer: string | null
  poster_url: string | null
  otix_media_id: string
  otix_title: string
  otix_confidence: number
  match_type: string
  status: string
  proposed_by: string
  created_at: string
}

export function SettingsAdminProposalsPage() {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [acting, setActing] = useState<string | null>(null)

  const fetchProposals = useCallback(async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('otix-access-token')
      const res = await fetch(`${API_BASE_URL}/admin/match-proposals?status=${filter}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setProposals(data.proposals || [])
      }
    } catch (err) { console.error('fetchProposals', err) }
    finally { setLoading(false) }
  }, [filter])

  useEffect(() => { fetchProposals() }, [fetchProposals])

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setActing(id)
    try {
      const token = localStorage.getItem('otix-access-token')
      await fetch(`${API_BASE_URL}/admin/match-proposals/${id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      setProposals(p => p.filter(x => x.id !== id))
    } catch (err) { console.error(action, err) }
    finally { setActing(null) }
  }

  const pending = proposals.filter(p => p.status === 'pending').length
  const approved = proposals.filter(p => p.status === 'approved').length

  return (
    <div className="p-6 min-h-full">
      <div className="flex items-center gap-3 mb-6">
        <a href="/settings/matching" className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </a>
        <h2 className="text-lg font-semibold text-white">Match Proposals</h2>
        <span className="text-sm text-white/40">({pending} pending, {approved} approved)</span>
      </div>

      <div className="flex gap-2 mb-4">
        {['pending', 'approved', 'rejected'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
              filter === f ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}>
            {f} ({f === 'pending' ? pending : f === 'approved' ? approved : proposals.filter(p => p.status === 'rejected').length})
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-white/40" />
        </div>
      )}

      {!loading && proposals.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <CheckCircle2 className="h-10 w-10 text-white/20" />
          <p className="text-sm text-white/40">No {filter} proposals</p>
        </div>
      )}

      <div className="space-y-3">
        {proposals.map(p => (
          <div key={p.id} className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4">
            <div className="flex items-start gap-4">
              {/* Posters */}
              <div className="flex gap-2 shrink-0">
                <div className="w-12 h-16 rounded-lg overflow-hidden bg-white/5">
                  {p.poster_url ? <img src={p.poster_url} alt="" className="w-full h-full object-cover" />
                   : <div className="w-full h-full flex items-center justify-center"><Gamepad2 className="h-4 w-4 text-white/20" /></div>}
                </div>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">{p.source}</span>
                  <span className="text-white/15">→</span>
                  <span className="text-xs font-semibold text-green-400">Otix</span>
                </div>
                <p className="text-sm font-medium text-white mt-1">{p.source_title}</p>
                <p className="text-xs text-white/50">→ {p.otix_title}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-white/30">
                  <span>ID: {p.source_game_id}</span>
                  {p.developer && <span>Dev: {p.developer}</span>}
                  <span className={p.otix_confidence >= 0.95 ? 'text-green-400' : p.otix_confidence >= 0.85 ? 'text-blue-400' : 'text-white/40'}>
                    {Math.round(p.otix_confidence * 100)}%
                  </span>
                  <span>{p.match_type}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {p.status === 'pending' && (
                  <>
                    <button onClick={() => handleAction(p.id, 'approve')} disabled={!!acting}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button onClick={() => handleAction(p.id, 'reject')} disabled={!!acting}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50">
                      <XCircle className="h-3.5 w-3.5" /> Reject
                    </button>
                  </>
                )}
                {p.status === 'approved' && (
                  <span className="text-xs text-green-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                  </span>
                )}
                {p.status === 'rejected' && (
                  <span className="text-xs text-red-400 font-medium flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" /> Rejected
                  </span>
                )}
                <a href={`/media/game/${p.otix_media_id}`} target="_blank" rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-white/20 hover:text-white/50 transition-colors">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
