import { useState } from 'react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { apiClient } from '@/lib/api/client'
import { openExternal } from '@/lib/utils/open-external'
import GOGIcon from '@/assets/provider-logos/gog.svg?react'

export interface GOGCodeModalProps {
  authUrl: string
  state: string
  onClose: () => void
  onLinked: () => void
  nodeId?: number
  isExiting?: boolean
}

function extractModalMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

function cleanGOGCode(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed)
      const code = url.searchParams.get('code') || url.searchParams.get('authorizationCode')
      if (code) return code.trim()
    } catch {
      // not a valid url, fallback to trimmed input
    }
  }
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { code?: unknown; authorizationCode?: unknown }
      if (parsed.code && typeof parsed.code === 'string') {
        return parsed.code.trim()
      }
      if (parsed.authorizationCode && typeof parsed.authorizationCode === 'string') {
        return parsed.authorizationCode.trim()
      }
    } catch {
      // not valid json, fallback to trimmed input
    }
  }
  return trimmed
}

export function GOGCodeModal({
  authUrl: initialAuthUrl,
  state: initialState,
  onClose,
  onLinked,
  nodeId,
  isExiting,
}: GOGCodeModalProps) {
  const [authUrl, setAuthUrl] = useState(initialAuthUrl)
  const [state, setState] = useState(initialState)
  const [paste, setPaste] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleOpenLogin = async () => {
    setError('')
    try {
      const { data } = nodeId
        ? await apiClient.post('/auth/oauth/gog', { node_id: nodeId })
        : await apiClient.post('/auth/oauth/gog')
      const newAuthUrl = data.authUrl || data.auth_url || authUrl
      const newState = data.state || state
      setAuthUrl(newAuthUrl)
      setState(newState)
      if (window.desktopAPI) {
        openExternal(newAuthUrl, { newTab: true })
      }
    } catch {
      // fallback
    }
  }

  const handleSubmit = async () => {
    const code = cleanGOGCode(paste)
    if (!code) {
      setError('Paste the authorization code or redirect URL from GOG.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await apiClient.post('/auth/oauth/gog/callback', {
        code,
        state,
        ...(nodeId ? { node_id: nodeId } : {}),
      })
      onLinked()
      onClose()
    } catch (err: unknown) {
      const msg = extractModalMessage(err)
      if (msg.toLowerCase().includes('session expired') || msg.toLowerCase().includes('expired')) {
        // Automatically attempt to refresh state and retry once
        try {
          const { data } = nodeId
            ? await apiClient.post('/auth/oauth/gog', { node_id: nodeId })
            : await apiClient.post('/auth/oauth/gog')
          const newState = data.state
          if (newState) {
            setState(newState)
            await apiClient.post('/auth/oauth/gog/callback', {
              code,
              state: newState,
              ...(nodeId ? { node_id: nodeId } : {}),
            })
            onLinked()
            onClose()
            return
          }
        } catch (retryErr) {
          setError(extractModalMessage(retryErr))
          return
        }
      }
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DkDialog
      open={!isExiting}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title="Link GOG"
      description="Sign in with your GOG account in the opened window. Once signed in, you will be redirected to an empty or success page. Copy and paste the full redirect URL or the code parameter below."
    >
      <div className="space-y-4">
        <a
          href={authUrl}
          target="_blank"
          rel="noopener noreferrer"
          role="button"
          className="inline-flex items-center justify-center gap-2 w-full h-10 px-4 rounded-xl text-sm font-medium bg-white/10 text-white shadow-none hover:bg-white/15 transition-colors"
          onClick={() => {
            openExternal(authUrl, { newTab: true })
            void handleOpenLogin()
          }}
        >
          <GOGIcon className="h-4 w-4 shrink-0" />
          <span>Open GOG login (new tab)</span>
        </a>
        <div className="space-y-1">
          <label htmlFor="gog-auth-code" className="block pl-1 text-sm font-medium">
            Authorization code or redirect URL
          </label>
          <textarea
            id="gog-auth-code"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Paste code or https://embed.gog.com/on_login_success?code=..."
            rows={4}
            className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.1)] transition-shadow duration-150 placeholder:text-white/30 focus:shadow-[0_0_0_1px_rgba(255,255,255,0.3)] resize-y min-h-[96px]"
          />
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <DkButton
          type="button"
          className="w-full"
          onClick={() => void handleSubmit()}
          loading={submitting}
          loadingText="Linking…"
          disabled={!paste.trim()}
        >
          Link account
        </DkButton>
      </div>
    </DkDialog>
  )
}
