import { useState, useEffect, useCallback, useRef } from 'react'
import { Brain, Download, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import type { AiModelStatus } from '@/lib/desktop/api'
import { cn } from '@/lib/utils'

const AI_STATUS_CFG: Record<AiModelStatus, { dot: string; label: string }> = {
  ready: { dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]', label: 'Model ready' },
  downloading: { dot: 'bg-amber-400 animate-pulse', label: 'Downloading...' },
  loading: { dot: 'bg-blue-400 animate-pulse', label: 'Loading into memory...' },
  not_available: { dot: 'bg-muted-foreground/30', label: 'Not downloaded' },
  error: { dot: 'bg-red-400', label: 'Error' },
}

export function IntelligenceSection() {
  const { isDesktop } = useDesktopPlatform()
  const [aiStatus, setAiStatus] = useState<AiModelStatus>('not_available')
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null)
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [systemPrompt, setSystemPrompt] = useState('')
  const [originalPrompt, setOriginalPrompt] = useState('')
  const unsubs = useRef<(() => void)[]>([])

  const api = window.desktopAPI

  useEffect(() => {
    if (!api?.aiGetStatus) return
    api.aiGetStatus().then(setAiStatus)
    api.aiGetDownloadProgress().then(setDownloadProgress)
    api.aiGetLoadingProgress().then(setLoadingProgress)
    api.aiGetSystemPrompt().then((p) => { setSystemPrompt(p); setOriginalPrompt(p) })
  }, [api])

  useEffect(() => {
    if (!api) return
    const cleanups: (() => void)[] = []
    if (api.onAiDownloadProgress) cleanups.push(api.onAiDownloadProgress((p) => setDownloadProgress(p)))
    if (api.onAiLoadingProgress) cleanups.push(api.onAiLoadingProgress((p) => setLoadingProgress(p)))
    if (api.onAiStatusChanged) cleanups.push(api.onAiStatusChanged((s) => {
      setAiStatus(s)
      if (s !== 'loading') setLoadingProgress(null)
    }))
    unsubs.current = cleanups
    return () => cleanups.forEach((fn) => fn())
  }, [api])

  const handleDownload = useCallback(async () => {
    if (!api?.aiDownloadModel || aiBusy) return
    setAiBusy(true); setAiError(null); setDownloadProgress(0); setAiStatus('downloading')
    try { await api.aiDownloadModel() }
    catch { setAiStatus('error'); setAiError('Download failed. Check your connection.') }
    finally { setAiBusy(false) }
  }, [api, aiBusy])

  const handleDelete = useCallback(async () => {
    if (!api?.aiDeleteModel || aiBusy) return
    setAiBusy(true); setAiError(null)
    try {
      await api.aiDeleteModel()
      setAiStatus('not_available'); setDownloadProgress(null); setLoadingProgress(null)
    } catch { setAiError('Failed to delete model.') }
    finally { setAiBusy(false) }
  }, [api, aiBusy])

  const saveSystemPrompt = useCallback(async () => {
    if (!api?.aiSetSystemPrompt || systemPrompt === originalPrompt) return
    await api.aiSetSystemPrompt(systemPrompt)
    setOriginalPrompt(systemPrompt)
  }, [api, systemPrompt, originalPrompt])

  const resetSystemPrompt = useCallback(async () => {
    if (!api?.aiSetSystemPrompt) return
    const defaultPrompt = 'You are a helpful assistant that helps users discover movies, TV shows, games, and music. You have access to a media library. Keep responses concise and friendly.'
    setSystemPrompt(defaultPrompt)
    await api.aiSetSystemPrompt(defaultPrompt)
    setOriginalPrompt(defaultPrompt)
  }, [api])

  const cfg = AI_STATUS_CFG[aiStatus]
  const showProgress = downloadProgress != null && downloadProgress < 100
  const showLoading = loadingProgress != null

  if (!isDesktop) return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--dk-surface-base)', boxShadow: 'var(--dk-shadow-md)' }}>
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Intelligence</h2>
          <p className="mt-1 text-sm text-muted-foreground">On-device AI features are only available in the Otix desktop app.</p>
        </div>
        <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          <Download className="h-5 w-5 mr-2" />
          Download the Otix desktop app to access AI features.
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6" style={{ backgroundColor: 'var(--dk-surface-base)', boxShadow: 'var(--dk-shadow-md)' }}>
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Intelligence</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Download a local AI model to power on-device chat and search. All processing stays on your machine.
          </p>
        </div>

        {/* Model card */}
        <div className="rounded-xl px-4 py-5" style={{ backgroundColor: 'var(--dk-surface-raised)', boxShadow: 'var(--dk-shadow-xs)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' }}>
              <Brain className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Gemma 3 4B (Q4_K_M)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Google Gemma 3 — optimized for local inference</p>
            </div>
            <span className="text-xs text-muted-foreground/60 bg-white/[0.04] px-2 py-1 rounded-md font-mono">~2.5 GB</span>
          </div>

          <div className="flex items-center gap-2 mt-4 text-xs">
            <span className={cn('h-2 w-2 rounded-full', cfg.dot)} />
            <span className="text-muted-foreground">{cfg.label}</span>
            {aiStatus === 'ready' && <span className="ml-auto text-emerald-400/60 text-[10px]">Ready to use in Chat</span>}
          </div>

          {showProgress && (
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--dk-surface-base)' }}>
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${downloadProgress}%`, background: 'linear-gradient(90deg, #10b981, #34d399)' }} />
              </div>
              <span className="text-xs font-medium tabular-nums text-emerald-400 w-10 text-right">{downloadProgress}%</span>
            </div>
          )}

          {showLoading && (
            <div className="flex items-center gap-3 mt-3">
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--dk-surface-base)' }}>
                <div className="h-full rounded-full transition-all duration-300 bg-blue-400" style={{ width: `${loadingProgress}%` }} />
              </div>
              <span className="text-xs font-medium tabular-nums text-blue-400 w-10 text-right">{loadingProgress}%</span>
            </div>
          )}

          {aiError && (
            <div className="flex items-center gap-2 mt-3 text-xs text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{aiError}</span>
            </div>
          )}

          <div className="flex items-center gap-3 mt-5">
            {aiStatus === 'loading' && !showLoading && (
              <div className="flex items-center gap-2 text-xs text-blue-400/70">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading model...
              </div>
            )}
            {(aiStatus === 'not_available' || aiStatus === 'error') && (
              <button onClick={handleDownload} disabled={aiBusy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20 hover:bg-emerald-500/25 hover:ring-emerald-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download Model
              </button>
            )}
            {aiStatus === 'ready' && (
              <button onClick={handleDelete} disabled={aiBusy}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 bg-red-500/15 text-red-400 ring-1 ring-red-500/20 hover:bg-red-500/25 hover:ring-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-4 w-4" />
                Delete Model
              </button>
            )}
          </div>
        </div>

        {/* ── System Prompt ── */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-medium">System Prompt</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Defines the AI's personality and behavior. Changes apply after save.</p>
            </div>
            <button onClick={resetSystemPrompt}
              className="text-xs text-muted-foreground/50 hover:text-foreground/70 transition-colors"
            >
              Reset
            </button>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            onBlur={saveSystemPrompt}
            rows={5}
            className="w-full rounded-xl px-4 py-3 text-xs leading-relaxed resize-none outline-none ring-1 ring-white/[0.06] focus:ring-primary/20 bg-transparent text-foreground/80 placeholder:text-muted-foreground/30 transition-all"
            placeholder="Describe the AI's personality, knowledge, and behavior..."
            disabled={aiStatus !== 'ready'}
          />
          {systemPrompt !== originalPrompt && (
            <p className="mt-1.5 text-[10px] text-amber-400/60">Unsaved changes. Click away or press Tab to save.</p>
          )}
        </div>
      </div>
    </div>
  )
}
