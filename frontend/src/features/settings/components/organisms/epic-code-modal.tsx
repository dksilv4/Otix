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

import { extractModalMessage, cleanEpicCode } from '../../utils/oauth-codes'

export const EpicCodeModal = ({
  authUrl: initialAuthUrl,
  state: initialState,
  onClose,
  onLinked,
  nodeId,
  isExiting,
}: EpicCodeModalProps) => {
  const [authUrl, setAuthUrl] = useState(initialAuthUrl)
  const [state, setState] = useState(initialState)
  const [paste, setPaste] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleOpenLogin = async () => {
    setError('')
    try {
      const { data } = nodeId
        ? await apiClient.post('/auth/oauth/epic', { node_id: nodeId })
        : await apiClient.post('/auth/oauth/epic')
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
        <a
          href={authUrl}
          target="_blank"
          rel="noopener noreferrer"
          role="button"
          className="inline-flex items-center justify-center gap-2 w-full h-10 px-4 rounded-xl text-sm font-medium bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-foreground shadow-none hover:bg-[var(--dk-surface-hover)] transition-colors"
          onClick={() => {
            openExternal(authUrl, { newTab: true })
            void handleOpenLogin()
          }}
        >
          <EpicIcon className="h-4 w-4 shrink-0" />
          <span>Open Epic Games login (new tab)</span>
        </a>
        <div className="space-y-1">
          <label htmlFor="epic-auth-code" className="block pl-1 text-sm font-medium text-foreground">
            Authorization code
          </label>
          <textarea
            id="epic-auth-code"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='Paste the code or {"authorizationCode":"..."}'
            rows={4}
            className="w-full rounded-xl px-4 py-3 text-sm text-foreground outline-none bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] transition-colors placeholder:text-muted-foreground focus:border-primary resize-y min-h-[96px]"
          />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
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
};
