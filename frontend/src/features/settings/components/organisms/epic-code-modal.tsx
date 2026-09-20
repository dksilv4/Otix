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

export function EpicCodeModal({
  authUrl,
  state,
  onClose,
  onLinked,
  isExiting,
}: EpicCodeModalProps) {
  const [paste, setPaste] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    const code = paste.trim()
    if (!code) {
      setError('Paste the authorization code from Epic Games.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await apiClient.post('/auth/oauth/epic/callback', { code, state })
      onLinked()
      onClose()
    } catch (err) {
      setError(extractModalMessage(err))
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
      description="Sign in with Epic Games, then paste the authorization code or the JSON that contains authorizationCode. Otix never stores the refresh token in the browser."
    >
      <div className="space-y-4">
        <DkButton
          type="button"
          variant="ghost"
          leftIcon={EpicIcon}
          className="w-full bg-white/10 text-white shadow-none hover:bg-white/15"
          onClick={() => openExternal(authUrl)}
        >
          Open Epic Games login
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
