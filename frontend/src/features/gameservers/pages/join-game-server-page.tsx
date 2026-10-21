import { useState, useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { useParams, useNavigate, Link } from '@tanstack/react-router'
import {
  Server,
  Gamepad2,
  Copy,
  Check,
  Play,
  Key,
  Users,
  Wifi,
  Globe,
  LogIn,
  UserPlus,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { useAuth } from '@/lib/providers/auth'
import { openExternal } from '@/lib/utils/open-external'
import {
  useResolveGameServerInvite,
  useJoinGameServerInvite,
} from '../queries/gameservers-queries'
import { getSteamConnectionInfo } from '../utils/connection'
import type { DedicatedGameServer } from '../types'

export const JoinGameServerPage = () => {
  const { code } = useParams({ strict: false }) as { code?: string }
  const navigate = useNavigate()
  const { toast } = useToast()
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth()

  const {
    data: inviteData,
    isLoading: isInviteLoading,
    isError,
    error,
  } = useResolveGameServerInvite(code)

  const joinMutation = useJoinGameServerInvite()

  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [hasJoinedLocally, setHasJoinedLocally] = useState(false)

  const server: DedicatedGameServer | undefined = inviteData?.server
  const invite = inviteData?.invite

  const isOwner = Boolean(server?.isOwner || (user?.username && server?.ownerUsername === user.username))
  const isMember = Boolean(server?.isMember || hasJoinedLocally || isOwner)

  const isOnline = server?.status === 'online'
  const isSteam = server?.serverType === 'steam_source'

  const steamInfo = server ? getSteamConnectionInfo(server) : null

  // Support auto-join redirect (e.g. after logging in from invite page)
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !code ||
      !isAuthenticated ||
      isMember ||
      joinMutation.isPending ||
      joinMutation.isSuccess
    ) {
      return
    }

    const searchParams = new URLSearchParams(window.location.search)
    if (searchParams.get('autoJoin') === 'true') {
      void joinMutation
        .mutateAsync(code)
        .then(() => {
          setHasJoinedLocally(true)
          toast({
            title: 'Welcome to the Server!',
            description: `You have successfully joined ${server?.name || 'the game server'}.`,
            variant: 'success',
          })
        })
        .catch(() => {
          // Keep explicit button visible if auto-join errors
        })
    }
  }, [code, isAuthenticated, isMember, joinMutation, server?.name, toast])

  const handleJoinServer = async () => {
    if (!code) return
    try {
      await joinMutation.mutateAsync(code)
      setHasJoinedLocally(true)
      toast({
        title: 'Joined Game Server',
        description: `You are now a member of ${server?.name || 'the game server'}.`,
        variant: 'success',
      })
    } catch (err: unknown) {
      toast({
        title: 'Could not join server',
        description: (err as { message?: string })?.message || 'Failed to join game server.',
        variant: 'error',
      })
    }
  }

  const handleCopyAddress = () => {
    if (!server?.connectionAddress) return
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(server.connectionAddress)
    }
    setCopiedAddress(true)
    toast({
      title: 'Address Copied',
      description: `${server.connectionAddress} copied to clipboard.`,
      variant: 'success',
    })
    setTimeout(() => setCopiedAddress(false), 2000)
  }

  const handleCopyPassword = () => {
    if (!server?.password) return
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(server.password)
    }
    setCopiedPassword(true)
    toast({
      title: 'Password Copied',
      description: 'Server password copied to clipboard.',
      variant: 'success',
    })
    setTimeout(() => setCopiedPassword(false), 2000)
  }

  const handleSteamJoin = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!steamInfo?.steamJoinUrl) return
    if (server?.password) {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        void navigator.clipboard.writeText(server.password)
      }
      toast({
        title: 'Launching Game via Steam',
        description: 'Server password copied to clipboard. Press Ctrl+V when prompted in-game!',
        variant: 'success',
      })
    }
    openExternal(steamInfo.steamJoinUrl)
  }

  const currentRedirectPath = typeof window !== 'undefined'
    ? `${window.location.pathname}?autoJoin=true`
    : `/servers/join/${code || ''}`

  // Loading state
  if (isInviteLoading || isAuthLoading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-xl border border-white/[0.04]">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Loading server invite...</h2>
            <p className="text-xs text-muted-foreground">Connecting to Otix game server registry</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state (invalid code, expired, 404)
  if (isError || !server || !invite) {
    const errorMessage =
      (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
      'This game server invite link is invalid, has expired, or has reached its maximum uses.'

    return (
      <div className="flex min-h-[75vh] items-center justify-center px-4 py-16">
        <Helmet>
          <title>Invite Not Found — Otix</title>
        </Helmet>
        <div className="w-full max-w-md rounded-3xl bg-[var(--dk-surface-glass)] p-8 shadow-2xl backdrop-blur-2xl border border-white/[0.04] text-center space-y-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10 text-destructive border border-white/[0.04]">
            <AlertCircle size={28} />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Invite Link Unavailable
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {errorMessage}
            </p>
          </div>

          <div className="flex flex-col gap-2.5 pt-2">
            <DkButton
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => void navigate({ to: '/settings/game-servers' })}
            >
              <Server size={15} />
              <span>Go to My Game Servers</span>
            </DkButton>

            <DkButton
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => void navigate({ to: '/' })}
            >
              Return Home
            </DkButton>
          </div>
        </div>
      </div>
    )
  }

  const pageTitle = `${server.name || 'Game Server'} — Join on Otix`

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-12">
      <Helmet>
        <title>{pageTitle}</title>
      </Helmet>

      <div className="w-full max-w-lg rounded-3xl bg-[var(--dk-surface-glass)] p-6 sm:p-8 shadow-2xl backdrop-blur-2xl border border-white/[0.04] space-y-6">
        {/* Game and Server Header */}
        <div className="flex items-start gap-4">
          {server.mediaItemPoster ? (
            <img
              src={server.mediaItemPoster}
              alt={server.mediaItemTitle || server.gameTitle}
              className="h-20 w-16 rounded-xl object-cover shadow-md shrink-0 border border-white/[0.04]"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--dk-surface-ghost)] text-primary shrink-0 border border-white/[0.04]">
              <Gamepad2 size={30} />
            </div>
          )}

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium tracking-wide uppercase text-muted-foreground">
                {server.mediaItemTitle || server.gameTitle || 'Dedicated Server'}
              </span>
              <span className="text-muted-foreground/40 text-xs">/</span>
              <span className="text-[11px] font-medium text-muted-foreground capitalize">
                {server.serverType.replace('_', ' ')}
              </span>
            </div>

            <h1 className="text-xl font-bold tracking-tight text-foreground truncate">
              {server.name}
            </h1>

            <p className="text-xs text-muted-foreground">
              Hosted by <span className="font-medium text-foreground">{server.ownerUsername}</span>
            </p>
          </div>
        </div>

        {/* Server Status and Metadata Bar */}
        <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isOnline ? 'bg-primary shadow-[0_0_8px_var(--primary)]' : 'bg-destructive/80'
              }`}
            />
            <div>
              <div className="text-xs font-semibold text-foreground capitalize">
                {server.status}
              </div>
              <div className="text-[11px] text-muted-foreground truncate max-w-[150px]">
                {server.currentMap ? `Map: ${server.currentMap}` : 'Ready to connect'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-right">
            {server.pingMs != null && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wifi size={13} className="text-primary" />
                <span>{server.pingMs}ms</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
              <Users size={13} className="text-primary" />
              <span>
                {server.currentPlayers} / {server.maxPlayers || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Description if present */}
        {server.description && (
          <p className="text-xs text-muted-foreground leading-relaxed bg-[var(--dk-surface-ghost)]/50 p-3 rounded-xl border border-white/[0.02]">
            {server.description}
          </p>
        )}

        {/* STATE 1: GUEST USER (Not authenticated) */}
        {!isAuthenticated && (
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-center space-y-1">
              <div className="text-xs font-semibold text-foreground">Sign in to join this server</div>
              <p className="text-[11px] text-muted-foreground">
                Joining adds this dedicated server to your personal Otix dashboard and library for instant 1-click access.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <DkButton
                type="button"
                variant="primary"
                className="w-full h-10 gap-2"
                onClick={() =>
                  void navigate({
                    to: '/auth/login',
                    search: { redirect: currentRedirectPath },
                  })
                }
              >
                <LogIn size={15} />
                <span>Sign In to Join</span>
              </DkButton>

              <DkButton
                type="button"
                variant="secondary"
                className="w-full h-10 gap-2"
                onClick={() =>
                  void navigate({
                    to: '/auth/register',
                    search: { redirect: currentRedirectPath },
                  })
                }
              >
                <UserPlus size={15} />
                <span>Create Account</span>
              </DkButton>
            </div>
          </div>
        )}

        {/* STATE 2: LOGGED IN BUT NOT YET JOINED */}
        {isAuthenticated && !isMember && (
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-foreground">Ready to join?</div>
                <div className="text-[11px] text-muted-foreground">
                  Save this server to your account for fast access and status updates.
                </div>
              </div>
            </div>

            <DkButton
              type="button"
              variant="primary"
              className="w-full h-11 text-sm font-semibold gap-2 shadow-lg"
              disabled={joinMutation.isPending}
              onClick={handleJoinServer}
            >
              {joinMutation.isPending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Joining server...</span>
                </>
              ) : (
                <>
                  <Server size={16} />
                  <span>Join Game Server</span>
                </>
              )}
            </DkButton>
          </div>
        )}

        {/* STATE 3: MEMBER OR OWNER (Connection details available) */}
        {isAuthenticated && isMember && (
          <div className="space-y-4 pt-2">
            {/* Membership badge */}
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-primary/10 text-primary border border-white/[0.04]">
              <CheckCircle2 size={16} className="shrink-0" />
              <span className="text-xs font-medium">
                {isOwner ? "You are the owner of this server" : "You have joined this server"}
              </span>
            </div>

            {/* Direct Connection Address */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Globe size={13} className="text-primary" />
                <span>In-Game Direct Connect (IP:Port)</span>
              </label>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
                <span className="flex-1 px-2 font-mono text-sm text-foreground select-all">
                  {server.connectionAddress}
                </span>
                <DkButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyAddress}
                  className="h-8 gap-1.5 shrink-0"
                >
                  {copiedAddress ? <Check size={13} /> : <Copy size={13} />}
                  <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
                </DkButton>
              </div>
            </div>

            {/* Password if required */}
            {server.password && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Key size={13} className="text-primary" />
                  <span>Server Password</span>
                </label>
                <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    readOnly
                    value={server.password}
                    className="flex-1 px-2 font-mono text-sm text-foreground bg-transparent border-0 focus:outline-none select-all"
                  />
                  <DkButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="h-8 px-2 text-xs"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </DkButton>
                  <DkButton
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyPassword}
                    className="h-8 gap-1.5 shrink-0"
                  >
                    {copiedPassword ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedPassword ? 'Copied' : 'Copy'}</span>
                  </DkButton>
                </div>
              </div>
            )}

            {/* Online Players list if any */}
            {server.playerList && server.playerList.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-foreground block">
                  Online Players ({server.playerList.length})
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
                  {server.playerList.map((player, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 rounded-md bg-[var(--dk-surface-raised)] text-xs font-medium text-foreground border border-white/[0.04]"
                    >
                      {player}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2.5 pt-2">
              {isSteam && steamInfo && (
                <a
                  href={steamInfo.steamJoinUrl}
                  onClick={handleSteamJoin}
                  className="inline-flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-md active:scale-[0.98]"
                >
                  <Play size={15} fill="currentColor" />
                  <span>1-Click Steam Join</span>
                </a>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Link
                  to="/settings/game-servers"
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-hover)] text-xs font-medium text-foreground transition-colors border border-white/[0.04]"
                >
                  <Server size={14} className="text-primary" />
                  <span>All Game Servers</span>
                </Link>

                {server.mediaItemId && (
                  <Link
                    to={`/m/game/${server.mediaItemId}` as string}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-hover)] text-xs font-medium text-foreground transition-colors border border-white/[0.04]"
                  >
                    <Gamepad2 size={14} className="text-primary" />
                    <span>View Game Details</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
