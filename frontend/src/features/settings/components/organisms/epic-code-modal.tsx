import { useState } from 'react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { apiClient } from '@/lib/api/client'
import { openExternal } from '@/lib/utils/open-external'
import EpicIcon from '@/assets/provider-logos/epic.svg?react'

export interface EpicCodeModalProps {
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

function cleanEpicCode(input: string): string {
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
      const parsed = JSON.parse(trimmed) as { authorizationCode?: unknown }
      if (parsed.authorizationCode && typeof parsed.authorizationCode === 'string') {
        return parsed.authorizationCode.trim()
      }
    } catch {
      // not valid json, fallback to trimmed input
    }
  }
  return trimmed
}

export function EpicCodeModal({
  authUrl: initialAuthUrl,
  state: initialState,
  onClose,
  onLinked,
  nodeId,
  isExiting,
}: EpicCodeModalProps) {
  const [authUrl, setAuthUrl] = useState(initialAuthUrl)
  const [state, setState] = useState(initialState)
  const [paste, setPaste] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')

  const handleOpenLogin = async () => {
    setOpening(true)
    setError('')
    try {
      const { data } = nodeId
        ? await apiClient.post('/auth/oauth/epic', { node_id: nodeId })
        : await apiClient.post('/auth/oauth/epic')
      const newAuthUrl = data.authUrl || data.auth_url || authUrl
      const newState = data.state || state
      setAuthUrl(newAuthUrl)
      setState(newState)
      openExternal(newAuthUrl, { newTab: true })
    } catch {
      openExternal(authUrl, { newTab: true })
    } finally {
      setOpening(false)
    }
  }

  const handleSubmit = async () => {
    const code = cleanEpicCode(paste)
    if (!code) {
      setError('Paste the authorization code from Epic Games.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await apiClient.post('/auth/oauth/epic/callback', {
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
            ? await apiClient.post('/auth/oauth/epic', { node_id: nodeId })
            : await apiClient.post('/auth/oauth/epic')
          const newState = data.state
          if (newState) {
            setState(newState)
            await apiClient.post('/auth/oauth/epic/callback', {
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
      title="Link Epic Games"
      description="Sign in with Epic Games in the new tab, then paste the authorization code or JSON containing authorizationCode below. Otix never stores the refresh token in the browser."
    >
      <div className="space-y-4">
        <DkButton
          type="button"
          variant="ghost"
          leftIcon={EpicIcon}
          className="w-full bg-white/10 text-white shadow-none hover:bg-white/15"
          onClick={() => void handleOpenLogin()}
          loading={opening}
          loadingText="Opening Epic Games…"
        >
          Open Epic Games login (new tab)
        </DkButton>
        <div className="space-y-1">
          <label htmlFor="epic-auth-code" className="block pl-1 text-sm font-medium">
            Authorization code
          </label>
          <textarea
            id="epic-auth-code"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='Paste the code or {"authorizationCode":"..."}'
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
