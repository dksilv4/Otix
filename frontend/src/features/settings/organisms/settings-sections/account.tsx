import { useState, useEffect } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { apiClient } from '@/lib/api-client'
import { fetchSessions, revokeSession, revokeOtherSessions, type SessionInfo } from '@/features/auth/session-queries'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkInput } from '@/features/dk-ui/atoms/input'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { cn } from '@/lib/utils'
import { Check, Shield, ShieldAlert, Loader2, Monitor } from 'lucide-react'
import { SectionHeader } from './profile'

function TwoFactorCard({ twoFactorEnabled }: { twoFactorEnabled: boolean }) {
  const [mode, setMode] = useState<'idle' | 'setup' | 'enabling' | 'disabling'>('idle')
  const [setupData, setSetupData] = useState<{ secret: string; provisioningUri: string; qrCodeSvg: string } | null>(null)
  const [code, setCode] = useState('')
  const [disablePassword, setDisablePassword] = useState('')
  const [error, setError] = useState('')

  const handleSetup = async () => {
    setError('')
    setCode('')
    try {
      const { data } = await apiClient.post('/auth/2fa/setup')
      setSetupData({ secret: data.secret, provisioningUri: data.provisioningUri, qrCodeSvg: data.qrCodeSvg })
      setMode('setup')
    } catch (err) {
      setError(extractMessage(err))
    }
  }

  const handleEnable = async () => {
    if (code.length !== 6) return
    setError('')
    setMode('enabling')
    try {
      await apiClient.post('/auth/2fa/enable', { code })
      setMode('idle')
      setSetupData(null)
      setCode('')
      // Reload to reflect the new twoFactorEnabled state
      window.location.reload()
    } catch (err) {
      setMode('setup')
      setError(extractMessage(err))
    }
  }

  const handleDisable = async () => {
    if (!disablePassword) return
    setError('')
    setMode('disabling')
    try {
      await apiClient.post('/auth/2fa/disable', { password: disablePassword })
      setMode('idle')
      setDisablePassword('')
      window.location.reload()
    } catch (err) {
      setMode('idle')
      setError(extractMessage(err))
    }
  }

  const handleCancel = () => {
    setMode('idle')
    setSetupData(null)
    setCode('')
    setDisablePassword('')
    setError('')
  }

  function extractMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'response' in err) {
      const resp = (err as { response?: { data?: { detail?: string } } }).response
      if (resp?.data?.detail) return resp.data.detail
    }
    if (err instanceof Error) return err.message
    return 'Something went wrong. Please try again.'
  }

  if (twoFactorEnabled) {
    return (
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader
          title="Two-Factor Authentication"
          description="Your account is protected with an authenticator app."
        />

        <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-500">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Enabled</p>
              <p className="text-xs text-muted-foreground">
                You'll need a code from your authenticator app to sign in.
              </p>
            </div>
          </div>

          {mode === 'disabling' ? (
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                className="h-9 w-40 rounded-lg bg-[var(--dk-surface-ghost-hover)] px-3 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleDisable()
                  if (e.key === 'Escape') handleCancel()
                }}
              />
              <DkButton size="sm" variant="outline" onClick={handleCancel}>
                Cancel
              </DkButton>
              <DkButton size="sm" variant="primary" onClick={handleDisable} disabled={!disablePassword}>
                Disable
              </DkButton>
            </div>
          ) : (
            <DkButton
              size="sm"
              variant="outline"
              onClick={() => setMode('disabling')}
            >
              Disable 2FA
            </DkButton>
          )}
        </div>

        {error && (
          <p className="mt-3 text-xs text-destructive">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
      <SectionHeader
        title="Two-Factor Authentication"
        description="Add an extra layer of security to your account."
      />

      {(mode === 'setup' || mode === 'enabling') && setupData ? (
        <div className="space-y-5">
          <div className="flex justify-center p-4 bg-white rounded-xl">
            <img src={setupData.qrCodeSvg} alt="2FA QR Code" className="h-48 w-48" />
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Scan this QR code with your authenticator app, or enter the secret manually:
            </p>
            <code className="block break-all rounded-lg bg-[var(--dk-surface-raised)] px-3 py-2 text-xs font-mono select-all">
              {setupData.secret}
            </code>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="flex h-11 w-full rounded-xl bg-[var(--dk-surface-ghost-hover)] px-4 text-center font-mono tracking-[0.3em] placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex items-center gap-3 pt-2">
            <DkButton variant="outline" onClick={handleCancel}>
              Cancel
            </DkButton>
            <DkButton
              variant="primary"
              onClick={handleEnable}
              loading={mode === 'enabling'}
              disabled={code.length !== 6}
            >
              Verify &amp; Enable
            </DkButton>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium">Not enabled</p>
              <p className="text-xs text-muted-foreground">
                Protect your account with an authenticator app like Google Authenticator or 1Password.
              </p>
            </div>
          </div>
          <DkButton size="sm" variant="primary" onClick={handleSetup}>
            Enable 2FA
          </DkButton>
        </div>
      )}
    </div>
  )
}

function VerificationCard({
  isVerified,
  state,
  onSend,
}: {
  isVerified: boolean
  state: 'idle' | 'sending' | 'sent'
  onSend: () => void
}) {
  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
      <SectionHeader
        title="Email Verification"
        description={
          isVerified
            ? 'Your email address has been verified.'
            : 'Verify your email to unlock all features.'
        }
      />

      <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              isVerified ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500',
            )}
          >
            {isVerified ? <Check className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-sm font-medium">
              {isVerified ? 'Verified' : 'Not verified'}
            </p>
            <p className="text-xs text-muted-foreground">
              {isVerified
                ? 'You have full access to all features.'
                : 'Some features may be limited until you verify.'}
            </p>
          </div>
        </div>

        {!isVerified && (
          <DkButton
            variant="outline"
            size="sm"
            onClick={onSend}
            loading={state === 'sending'}
            disabled={state === 'sent'}
          >
            {state === 'sending' && <Loader2 className="h-4 w-4 animate-spin" />}
            {state === 'sent' ? 'Sent!' : 'Send Verification Email'}
          </DkButton>
        )}
      </div>

      {state === 'sent' && (
        <p className="mt-3 text-xs text-green-500 animate-in fade-in">
          Verification email sent. Check your inbox and follow the link to verify your account.
        </p>
      )}
    </div>
  )
}

function SessionsCard() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revokingKey, setRevokingKey] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)
  const [error, setError] = useState('')

  const loadSessions = async () => {
    try {
      const data = await fetchSessions()
      setSessions(data.sessions)
      setCurrentKey(data.currentSessionKey)
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSessions()
  }, [])

  const handleRevoke = async (sessionKey: string) => {
    setRevokingKey(sessionKey)
    setError('')
    try {
      await revokeSession(sessionKey)
      setSessions((prev) => prev.filter((s) => s.sessionKey !== sessionKey))
    } catch {
      setError('Failed to revoke session.')
    } finally {
      setRevokingKey(null)
    }
  }

  const handleRevokeAllOthers = async () => {
    setRevokingAll(true)
    setError('')
    try {
      const count = await revokeOtherSessions()
      if (count > 0) {
        setSessions((prev) => prev.filter((s) => s.sessionKey === currentKey))
      }
    } catch {
      setError('Failed to revoke other sessions.')
    } finally {
      setRevokingAll(false)
    }
  }

  const formatUA = (ua: string | null): string => {
    if (!ua) return 'Unknown device'
    // Try to extract browser name
    const browsers = ['Firefox', 'Chrome', 'Safari', 'Edge', 'Opera']
    for (const b of browsers) {
      if (ua.includes(b)) {
        const match = ua.match(new RegExp(`${b}\\/([\\d.]+)`))
        return match ? `${b} ${match[1]}` : b
      }
    }
    return ua.length > 50 ? ua.slice(0, 50) + '…' : ua
  }

  const formatTime = (iso: string | null): string => {
    if (!iso) return ''
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHrs = Math.floor(diffMin / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    const diffDays = Math.floor(diffHrs / 24)
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  }

  const otherSessions = sessions.filter((s) => s.sessionKey !== currentKey)

  return (
    <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
      <SectionHeader
        title="Active Sessions"
        description="Devices where your account is currently signed in."
      />

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading sessions...
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((session) => {
            const isCurrent = session.sessionKey === currentKey
            return (
              <div
                key={session.sessionKey}
                className={cn(
                  'flex items-center justify-between rounded-xl px-4 py-3',
                  isCurrent
                    ? 'bg-primary/5 border border-primary/15'
                    : 'bg-[var(--dk-surface-raised)]',
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      isCurrent ? 'bg-primary/10 text-primary' : 'bg-[var(--dk-surface-overlay)] text-muted-foreground',
                    )}
                  >
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">
                        {formatUA(session.userAgent)}
                      </p>
                      {isCurrent && (
                        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {session.ipAddress ?? 'Unknown IP'}
                      {session.lastSeenAt && (
                        <> &middot; {formatTime(session.lastSeenAt)}</>
                      )}
                    </p>
                  </div>
                </div>

                {!isCurrent && (
                  <DkButton
                    size="sm"
                    variant="outline"
                    onClick={() => handleRevoke(session.sessionKey)}
                    loading={revokingKey === session.sessionKey}
                  >
                    Revoke
                  </DkButton>
                )}
              </div>
            )
          })}

          {sessions.length === 0 && (
            <p className="py-4 text-sm text-muted-foreground">No active sessions found.</p>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      {otherSessions.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/30">
          <DkButton
            variant="outline"
            size="sm"
            onClick={handleRevokeAllOthers}
            loading={revokingAll}
          >
            Revoke All Other Sessions
          </DkButton>
        </div>
      )}
    </div>
  )
}

export function AccountSection({
  user,
  isAuthenticated,
}: {
  user: {
    email: string
    username: string
    isVerified: boolean
    twoFactorEnabled: boolean
    dailyMoodCheckinsEnabled?: boolean
  } | null
  isAuthenticated: boolean
}) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [dailyMoodCheckinsEnabled, setDailyMoodCheckinsEnabled] = useState(user?.dailyMoodCheckinsEnabled ?? true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [verificationState, setVerificationState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const location = useLocation()

  useEffect(() => {
    if (!user) return
    setEmail(user.email)
    setUsername(user.username)
    setDailyMoodCheckinsEnabled(user.dailyMoodCheckinsEnabled ?? true)
  }, [user])

  if (!isAuthenticated) {
    return (
      <div className="space-y-4 rounded-2xl bg-[var(--dk-surface-base)] p-12 text-center shadow-[var(--dk-shadow-sm)]">
        <Shield className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Sign in required</p>
          <p className="text-xs text-muted-foreground mt-1">Sign in to manage your account settings.</p>
        </div>
        <Link
          to="/auth/login"
          search={{ redirect: location.href }}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dk-ring-color)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] rounded-xl px-5 py-2.5 text-sm bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-primary/90"
        >
          Sign In
        </Link>
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const { data } = await apiClient.patch('/auth/me', {
        email,
        username,
        dailyMoodCheckinsEnabled,
      })
      setEmail(data.email)
      setUsername(data.username)
      setDailyMoodCheckinsEnabled(data.dailyMoodCheckinsEnabled ?? true)
      setSaved(true)
    } catch {
      // leave fields as-is
    } finally {
      setSaving(false)
    }
  }

  const hasChanges =
    email !== (user?.email ?? '') ||
    username !== (user?.username ?? '') ||
    dailyMoodCheckinsEnabled !== (user?.dailyMoodCheckinsEnabled ?? true)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader title="Identity" description="Your core account details." />

        <div className="space-y-5">
          <DkInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            hint="Used for sign-in and account recovery."
          />
          <DkInput
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            hint="Shown publicly on your profile and reviews."
          />
        </div>

        <div className="mt-6 border-t border-border/30 pt-5">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">Daily mood check-in</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Show the mood scale on the home page once per UTC day.
              </p>
            </div>
            <DkSwitch
              checked={dailyMoodCheckinsEnabled}
              onCheckedChange={setDailyMoodCheckinsEnabled}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-6 pt-5 border-t border-border/30">
          <DkButton variant="primary" onClick={handleSave} loading={saving} disabled={!hasChanges}>
            Save Changes
          </DkButton>
          {saved && <span className="text-xs text-green-500 animate-in fade-in">Saved</span>}
        </div>
      </div>

      <VerificationCard
        isVerified={user?.isVerified ?? false}
        state={verificationState}
        onSend={async () => {
          setVerificationState('sending')
          try {
            await apiClient.post('/auth/verify-email/send')
            setVerificationState('sent')
          } catch {
            setVerificationState('idle')
          }
        }}
      />

      <TwoFactorCard twoFactorEnabled={user?.twoFactorEnabled ?? false} />

      <SessionsCard />

      <div className="rounded-2xl bg-[var(--dk-surface-raised)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader title="Danger Zone" description="Account lifecycle operations." />
        <p className="text-sm text-muted-foreground">
          Account deactivation and deletion are not yet available. Coming soon.
        </p>
      </div>
    </div>
  )
}
