import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { DkSwitch } from '@ui/atoms/switch'
import { cn } from '@/lib/utils'
import { Check, Shield, ShieldAlert, Loader2, Monitor, Trash2 } from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { useSettingsSaveBar } from '../context/settings-save-context'
import {
  fetchSessions,
  revokeSession,
  revokeOtherSessions,
  extractAccountErrorMessage,
  type SessionInfo,
} from '../utils/account'

const TwoFactorCard = ({ twoFactorEnabled }: { twoFactorEnabled: boolean }) => {
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
      setError(extractAccountErrorMessage(err))
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
      window.location.reload()
    } catch (err) {
      setMode('setup')
      setError(extractAccountErrorMessage(err))
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
      setError(extractAccountErrorMessage(err))
    }
  }

  const handleCancel = () => {
    setMode('idle')
    setSetupData(null)
    setCode('')
    setDisablePassword('')
    setError('')
  }

  if (twoFactorEnabled) {
    return (
      <SettingsCard>
        <SectionHeader
          title="Two-Factor Authentication"
          description="Your account is protected with an authenticator app."
        />

        <div className="flex items-center justify-between rounded-xl px-4 py-4" style={{ backgroundColor: 'var(--dk-surface-raised)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-green-500" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
              <Check className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Enabled</p>
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
                className="h-9 w-40 rounded-lg px-3 text-sm text-foreground outline-none bg-[var(--dk-surface-field)]"
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
          <p className="text-xs text-red-400 mt-3">{error}</p>
        )}
      </SettingsCard>
    )
  }

  return (
    <SettingsCard>
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
            <code
              className="block break-all rounded-lg px-3 py-2 text-xs font-mono select-all text-foreground"
              style={{ backgroundColor: 'var(--dk-surface-raised)' }}
            >
              {setupData.secret}
            </code>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Verification Code</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              autoFocus
              className="flex h-11 w-full rounded-xl px-4 text-center font-mono tracking-widest text-foreground outline-none bg-[var(--dk-surface-field)]"
              style={{ boxShadow: code.length === 6 ? '0 0 0 2px color-mix(in srgb, var(--primary) 50%, transparent)' : undefined }}
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

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
        <div className="flex items-center justify-between rounded-xl px-4 py-4" style={{ backgroundColor: 'var(--dk-surface-raised)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl text-amber-500" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)' }}>
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Not enabled</p>
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
    </SettingsCard>
  )
};

const VerificationCard = ({
  isVerified,
  state,
  onSend,
}: {
  isVerified: boolean
  state: 'idle' | 'sending' | 'sent'
  onSend: () => void
}) => {
  return (
    <SettingsCard>
      <SectionHeader
        title="Email Verification"
        description={
          isVerified
            ? 'Your email address has been verified.'
            : 'Verify your email to unlock all features.'
        }
      />

      <div className="flex items-center justify-between rounded-xl px-4 py-4" style={{ backgroundColor: 'var(--dk-surface-raised)' }}>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-xl',
              isVerified ? 'text-green-500' : 'text-amber-500',
            )}
            style={{ backgroundColor: isVerified ? 'rgba(34, 197, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)' }}
          >
            {isVerified ? <Check className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">
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
        <p className="text-xs text-green-500 mt-3">
          Verification email sent. Check your inbox and follow the link to verify your account.
        </p>
      )}
    </SettingsCard>
  )
};

const SESSIONS_PER_PAGE = 5

const SessionsCard = () => {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [revokingKey, setRevokingKey] = useState<string | null>(null)
  const [revokingAll, setRevokingAll] = useState(false)
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)

  // Reset page when sessions shrink past current view
  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sessions.length / SESSIONS_PER_PAGE) - 1)
    if (page > maxPage) setPage(maxPage)
  }, [sessions.length, page])

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
  const totalPages = Math.ceil(sessions.length / SESSIONS_PER_PAGE)
  const safePage = Math.min(page, Math.max(0, totalPages - 1))
  const paginatedSessions = sessions.slice(safePage * SESSIONS_PER_PAGE, (safePage + 1) * SESSIONS_PER_PAGE)

  return (
    <SettingsCard>
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
          {paginatedSessions.map((session) => {
            const isCurrent = session.sessionKey === currentKey
            return (
              <div
                key={session.sessionKey}
                className={cn(
                  'flex items-center justify-between rounded-xl px-4 py-3',
                )}
                style={{
                  backgroundColor: isCurrent
                    ? 'color-mix(in srgb, var(--primary) 5%, transparent)'
                    : 'var(--dk-surface-raised)',
                  boxShadow: isCurrent
                    ? '0 0 0 1px color-mix(in srgb, var(--primary) 15%, transparent)'
                    : 'none',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                      isCurrent ? 'text-primary' : 'text-muted-foreground',
                    )}
                    style={{
                      backgroundColor: isCurrent
                        ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                        : 'var(--dk-surface-overlay)',
                    }}
                  >
                    <Monitor className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {formatUA(session.userAgent)}
                      </p>
                      {isCurrent && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-primary"
                          style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
                        >
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {session.ipAddress ?? 'Unknown IP'}
                      {session.lastSeenAt && (
                        <> {'·'} {formatTime(session.lastSeenAt)}</>
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

      {sessions.length > SESSIONS_PER_PAGE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-muted-foreground">
            {safePage * SESSIONS_PER_PAGE + 1}–{Math.min((safePage + 1) * SESSIONS_PER_PAGE, sessions.length)} of {sessions.length}
          </p>
          <div className="flex items-center gap-2">
            <DkButton
              size="sm"
              variant="ghost"
              disabled={safePage === 0}
              onClick={() => setPage(p => p - 1)}
            >
              ← Prev
            </DkButton>
            <DkButton
              size="sm"
              variant="ghost"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
            >
              Next →
            </DkButton>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}

      {otherSessions.length > 0 && (
        <div className="h-px bg-[var(--dk-separator)] mt-4 mb-4" />
      )}

      {otherSessions.length > 0 && (
        <div>
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
    </SettingsCard>
  )
};

export const SettingsAccountPage = () => {
  const { user, isAuthenticated } = useAuth()
  const [email, setEmail] = useState(user?.email ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [dailyMoodCheckinsEnabled, setDailyMoodCheckinsEnabled] = useState(user?.dailyMoodCheckinsEnabled ?? true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [verificationState, setVerificationState] = useState<'idle' | 'sending' | 'sent'>('idle')

  useEffect(() => {
    if (!user) return
    setEmail(user.email)
    setUsername(user.username)
    setDailyMoodCheckinsEnabled(user.dailyMoodCheckinsEnabled ?? true)
  }, [user])

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

  const hasChanges = Boolean(
    user && (
      email.trim() !== (user.email ?? '').trim() ||
      username.trim() !== (user.username ?? '').trim() ||
      dailyMoodCheckinsEnabled !== (user.dailyMoodCheckinsEnabled ?? true)
    )
  )

  const handleDiscard = () => {
    if (!user) return
    setEmail(user.email)
    setUsername(user.username)
    setDailyMoodCheckinsEnabled(user.dailyMoodCheckinsEnabled ?? true)
  }

  useSettingsSaveBar({
    hasChanges,
    onSave: handleSave,
    onDiscard: handleDiscard,
    saving,
    saved,
    label: 'Save Account',
  })

  if (!isAuthenticated) {
    return (
      <SettingsLockedState
        title="Otix Account & Security"
        description="Sign in to manage account security, email preferences, two-factor authentication, and connected devices."
        icon={Shield}
        primaryLabel="Sign In"
        secondaryLabel="Create Free Account"
        secondaryTo="/auth/register"
      />
    )
  }

  return (
    <div id="settings-account-section" className="space-y-5">
      <SectionHeader
        variant="page"
        icon={Shield}
        title="Security"
        description="Credentials, two-factor authentication, and active sessions."
      />
      <SettingsCard>
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

        <div className="my-6" />

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Daily mood check-in</p>
            <p className="text-xs text-muted-foreground mt-1">
              Show the mood scale on the home page once per UTC day.
            </p>
          </div>
          <DkSwitch
            checked={dailyMoodCheckinsEnabled}
            onCheckedChange={setDailyMoodCheckinsEnabled}
          />
        </div>
      </SettingsCard>

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

      <SettingsCard>
        <SectionHeader
          title="Data Deletion &amp; Account Closure"
          description="Exercise your GDPR Article 17 and CCPA Right to Erasure."
        />
        <div className="space-y-3 pt-2">
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            You can request the permanent deletion of your Otix account, login credentials, and all synchronized media preferences. Requests are processed within 30 days.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href={`mailto:privacy@otix.app?subject=${encodeURIComponent(
                `Account Deletion Request - ${user?.email || user?.username || 'User'}`
              )}&body=${encodeURIComponent(
                `Hello Otix Privacy Team,\n\nPlease permanently delete my account and all associated personal data associated with username "${user?.username || ''}" and email "${user?.email || ''}".\n\nThank you.`
              )}`}
              className="inline-flex items-center gap-2 rounded-xl bg-destructive/15 hover:bg-destructive/25 px-3.5 py-2 text-xs font-semibold text-destructive transition-all active:scale-95"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Request Account &amp; Data Deletion</span>
            </a>
            <Link
              to="/privacy"
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              <span>Learn more about your data rights</span>
            </Link>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
};
