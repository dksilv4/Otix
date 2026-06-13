// TODO: Review this file
import './account.scss'
import { useState, useEffect } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { apiClient } from '@/lib/api-client'
import { DkButton } from '@/old-features/dk-ui/atoms/button'
import { DkInput } from '@/old-features/dk-ui/atoms/input'
import { DkSwitch } from '@/old-features/dk-ui/atoms/switch'
import { cn } from '@/lib/utils'
import { Check, Shield, ShieldAlert, Loader2, Monitor } from 'lucide-react'
import { SectionHeader } from './profile'

interface SessionInfo {
  sessionKey: string
  ipAddress: string | null
  userAgent: string | null
  lastSeenAt: string | null
  createdAt: string | null
}

interface SessionListData {
  sessions: SessionInfo[]
  currentSessionKey: string | null
}

async function fetchSessions(): Promise<SessionListData> {
  const { data } = await apiClient.get('/auth/sessions')
  return data as SessionListData
}

async function revokeSession(sessionKey: string): Promise<void> {
  await apiClient.delete(`/auth/sessions/${sessionKey}`)
}

async function revokeOtherSessions(): Promise<number> {
  const { data } = await apiClient.delete('/auth/sessions')
  const msg = data.message as string
  const match = msg.match(/Revoked (\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

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
      <div className="dk-settings-account__card">
        <SectionHeader
          title="Two-Factor Authentication"
          description="Your account is protected with an authenticator app."
        />

        <div className="dk-settings-account__row">
          <div className="dk-settings-account__row-content">
            <div className="dk-settings-account__icon dk-settings-account__icon--positive">
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="dk-settings-account__text--title">Enabled</p>
              <p className="dk-settings-account__text--desc">
                You'll need a code from your authenticator app to sign in.
              </p>
            </div>
          </div>

          {mode === 'disabling' ? (
            <div className="dk-settings-account__disabling-row">
              <input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                className="dk-settings-account__input--compact"
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
          <p className="dk-settings-account__text--error dk-settings-account__text--with-margin">{error}</p>
        )}
      </div>
    )
  }

  return (
    <div className="dk-settings-account__card">
      <SectionHeader
        title="Two-Factor Authentication"
        description="Add an extra layer of security to your account."
      />

      {(mode === 'setup' || mode === 'enabling') && setupData ? (
        <div className="dk-settings-account__setup">
          <div className="dk-settings-account__qrcode">
            <img src={setupData.qrCodeSvg} alt="2FA QR Code" className="h-48 w-48" />
          </div>

          <div className="dk-settings-account__secret-section">
            <p className="dk-settings-account__text--desc">
              Scan this QR code with your authenticator app, or enter the secret manually:
            </p>
            <code className="dk-settings-account__secret">
              {setupData.secret}
            </code>
          </div>

          <div className="dk-settings-account__secret-section">
            <label className="dk-settings-account__verify-label">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="dk-settings-account__input"
            />
          </div>

          {error && <p className="dk-settings-account__text--error">{error}</p>}

          <div className="dk-settings-account__actions">
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
        <div className="dk-settings-account__row">
          <div className="dk-settings-account__row-content">
            <div className="dk-settings-account__icon dk-settings-account__icon--warning">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="dk-settings-account__text--title">Not enabled</p>
              <p className="dk-settings-account__text--desc">
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
    <div className="dk-settings-account__card">
      <SectionHeader
        title="Email Verification"
        description={
          isVerified
            ? 'Your email address has been verified.'
            : 'Verify your email to unlock all features.'
        }
      />

      <div className="dk-settings-account__row">
        <div className="dk-settings-account__row-content">
          <div
            className={cn(
              'dk-settings-account__icon',
              isVerified ? 'dk-settings-account__icon--positive' : 'dk-settings-account__icon--warning',
            )}
          >
            {isVerified ? <Check className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div>
            <p className="dk-settings-account__text--title">
              {isVerified ? 'Verified' : 'Not verified'}
            </p>
            <p className="dk-settings-account__text--desc">
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
        <p className="dk-settings-account__text--success dk-settings-account__text--with-margin">
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
    <div className="dk-settings-account__card">
      <SectionHeader
        title="Active Sessions"
        description="Devices where your account is currently signed in."
      />

      {loading ? (
        <div className="dk-settings-account__loading">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading sessions...
        </div>
      ) : (
        <div className="dk-settings-account__session-list">
          {sessions.map((session) => {
            const isCurrent = session.sessionKey === currentKey
            return (
              <div
                key={session.sessionKey}
                className={cn(
                  'dk-settings-account__session',
                  isCurrent
                    ? 'dk-settings-account__session--current'
                    : 'dk-settings-account__session--inactive',
                )}
              >
                <div className="dk-settings-account__row-content--wide">
                  <div
                    className={cn(
                      'dk-settings-account__session-icon',
                      isCurrent ? 'dk-settings-account__session-icon--current' : 'dk-settings-account__session-icon--inactive',
                    )}
                  >
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div className="dk-settings-account__session-details">
                    <div className="dk-settings-account__session-header">
                      <p className="dk-settings-account__session-name">
                        {formatUA(session.userAgent)}
                      </p>
                      {isCurrent && (
                        <span className="dk-settings-account__badge">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="dk-settings-account__text--desc">
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
            <p className="dk-settings-account__text--empty">No active sessions found.</p>
          )}
        </div>
      )}

      {error && <p className="dk-settings-account__text--error dk-settings-account__text--with-margin">{error}</p>}

      {otherSessions.length > 0 && (
        <div className="dk-settings-account__revoke-all">
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
      <div className="dk-settings-account__card--centered">
        <Shield className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <div>
          <p className="dk-settings-account__text--title">Sign in required</p>
          <p className="dk-settings-account__text--desc dk-settings-account__text--small-margin">Sign in to manage your account settings.</p>
        </div>
        <Link
          to="/auth/login"
          search={{ redirect: location.href }}
          className="dk-settings-account__signin-link"
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
    <div className="dk-settings-account__body">
      <div className="dk-settings-account__card">
        <SectionHeader title="Identity" description="Your core account details." />

        <div className="dk-settings-account__form">
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

        <div className="dk-settings-account__divider">
          <div className="dk-settings-account__row--compact">
            <div className="dk-settings-account__mood-text">
              <p className="dk-settings-account__mood-title">Daily mood check-in</p>
              <p className="dk-settings-account__text--desc dk-settings-account__text--small-margin">
                Show the mood scale on the home page once per UTC day.
              </p>
            </div>
            <DkSwitch
              checked={dailyMoodCheckinsEnabled}
              onCheckedChange={setDailyMoodCheckinsEnabled}
            />
          </div>
        </div>

        <div className="dk-settings-account__actions--bar">
          <DkButton variant="primary" onClick={handleSave} loading={saving} disabled={!hasChanges}>
            Save Changes
          </DkButton>
          {saved && <span className="dk-settings-account__text--success">Saved</span>}
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

      <div className="dk-settings-account__card--raised">
        <SectionHeader title="Danger Zone" description="Account lifecycle operations." />
        <p className="dk-settings-account__text--body">
          Account deactivation and deletion are not yet available. Coming soon.
        </p>
      </div>
    </div>
  )
}
