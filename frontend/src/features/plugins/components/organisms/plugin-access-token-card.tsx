import { useRef, useState } from 'react'
import { Check, Copy, KeyRound, PowerOff, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { issuePluginToken } from '@/features/plugins/server-api'
import { Alert, Button } from '@/features/plugins/ui'

interface PluginAccessTokenCardProps {
  pluginId: string
  pluginName: string
  /** DB enabled state — enabled plugins own a live scoped token. */
  enabled: boolean
}

export const PluginAccessTokenCard = ({ pluginId, pluginName, enabled }: PluginAccessTokenCardProps) => {
  const [reveal, setReveal] = useState<{ name: string; token: string } | null>(null)
  const [rotating, setRotating] = useState(false)
  const [rotateError, setRotateError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const secretInputRef = useRef<HTMLInputElement>(null)

  const rotate = async () => {
    setRotating(true)
    setRotateError(null)
    try {
      const created = await issuePluginToken(pluginId)
      setReveal({ name: created.name, token: created.token })
      setCopied(false)
    } catch (err) {
      setRotateError(err instanceof Error ? err.message : 'Could not rotate the token.')
    } finally {
      setRotating(false)
    }
  }

  const copySecret = async () => {
    if (!reveal) return
    try {
      await navigator.clipboard.writeText(reveal.token)
      setCopied(true)
    } catch {
      secretInputRef.current?.select()
    }
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <KeyRound className="h-4.5 w-4.5" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">API access</p>

        {reveal && (
          <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-3.5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-emerald-300">
              <Check className="h-4 w-4" /> New token issued — copy it now
            </p>
            <p className="mt-1 text-xs leading-relaxed text-white/55">
              The full secret is only shown this once and can’t be retrieved later. The previous token is already
              retired.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <input
                ref={secretInputRef}
                readOnly
                value={reveal.token}
                onFocus={(e) => e.target.select()}
                className="h-9 min-w-0 flex-1 rounded-lg border border-emerald-500/20 bg-black/30 px-3 font-mono text-xs text-emerald-200 outline-none"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={copySecret}
                icon={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setReveal(null)} icon={<X className="h-4 w-4" />}>
                Done
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-300/80">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              Anyone with this token can call every method {pluginName} exposes.
            </p>
          </div>
        )}

        {!reveal &&
          (enabled ? (
            <>
              <p className="mt-0.5 text-xs leading-relaxed text-white/45">
                {pluginName} is enabled, so external tools can call its data methods with its scoped token.
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-white/35">
                The secret is shown once at rotate time — rotate to reveal it or replace the current credential.
              </p>
            </>
          ) : (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs leading-relaxed text-white/45">
              <PowerOff className="h-3.5 w-3.5 shrink-0 text-white/25" />
              API access is off. Enable {pluginName} to activate its scoped token.
            </p>
          ))}

        {rotateError && !reveal && (
          <Alert tone="error" className="mt-2.5">
            {rotateError}
          </Alert>
        )}
      </div>

      {!reveal && enabled && (
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button
            variant="outline"
            size="xs"
            onClick={rotate}
            loading={rotating}
            disabled={rotating}
            icon={<RefreshCw className="h-3 w-3" />}
          >
            {rotating ? 'Rotating…' : 'Rotate token'}
          </Button>
        </div>
      )}
    </div>
  )
};
