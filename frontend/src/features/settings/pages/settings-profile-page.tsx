import { useState, useRef, useEffect } from 'react'
import { DkDialog } from '@ui/molecules/dialog'
import { useModal } from '@/lib/modals'
import { useAuth } from '@/lib/providers/auth'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { DkButton } from '@ui/atoms/button'
import { DkAvatar } from '@ui/atoms/avatar'
import { DkDropdown } from '@ui/atoms/dropdown'
import { DkSwitch } from '@ui/atoms/switch'
import { cn } from '@/lib/utils'
import { CropModal } from '../components/molecules/crop-modal'
import { User, Pencil, Shield, Link2, Image } from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { useSettingsSaveBar } from '../context/settings-save-context'
import { useToast } from '@ui/molecules/toast'

export function normalizeUploadedUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  if (/^https?:\/\/(api|otix-api)(:\d+)?(\/.*)?$/i.test(rawUrl)) {
    return rawUrl.replace(/^https?:\/\/(api|otix-api)(:\d+)?/i, origin)
  }
  if (rawUrl.startsWith('/')) {
    return `${origin}${rawUrl}`
  }
  return rawUrl
}

const BIO_MAX_LENGTH = 250

const COUNTRY_OPTIONS = [
  { value: 'us', label: 'United States' },
  { value: 'gb', label: 'United Kingdom' },
  { value: 'ca', label: 'Canada' },
  { value: 'au', label: 'Australia' },
  { value: 'de', label: 'Germany' },
  { value: 'fr', label: 'France' },
  { value: 'jp', label: 'Japan' },
  { value: 'br', label: 'Brazil' },
  { value: 'kr', label: 'South Korea' },
  { value: 'in', label: 'India' },
  { value: 'mx', label: 'Mexico' },
  { value: 'es', label: 'Spain' },
  { value: 'it', label: 'Italy' },
  { value: 'nl', label: 'Netherlands' },
  { value: 'se', label: 'Sweden' },
  { value: 'no', label: 'Norway' },
  { value: 'dk', label: 'Denmark' },
  { value: 'fi', label: 'Finland' },
  { value: 'pl', label: 'Poland' },
  { value: 'ru', label: 'Russia' },
  { value: 'cn', label: 'China' },
  { value: 'nz', label: 'New Zealand' },
  { value: 'ie', label: 'Ireland' },
  { value: 'pt', label: 'Portugal' },
  { value: 'ar', label: 'Argentina' },
]

const VISIBILITY_OPTIONS = [
  { value: 'everyone', label: 'Everyone' },
  { value: 'friends', label: 'Friends only' },
  { value: 'hidden', label: 'Hidden' },
]

export function AssetEditor({
  compact = false,
  onSubmit,
  onRemove,
  value,
  cropConfig,
}: {
  compact?: boolean
  onSubmit: (url: string) => void
  onRemove?: () => void
  value: string
  cropConfig?: { shape: 'round' | 'rect'; aspect: number; outputSize: { width: number; height: number } }
}) {
  const [mode, setMode] = useState<'file' | 'url'>('file')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewObjectUrl, setPreviewObjectUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [urlDraft, setUrlDraft] = useState(value)
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { openModal } = useModal()
  const cropCloseRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
      if (cropImageUrl) URL.revokeObjectURL(cropImageUrl)
    }
  }, [previewObjectUrl, cropImageUrl])

  // Open/close CropModal via central framework when cropImageUrl changes
  useEffect(() => {
    if (cropImageUrl && cropConfig) {
      cropCloseRef.current = openModal(
        <DkDialog
          open={true}
          onOpenChange={() => {
            handleCropCancel()
          }}
          title="Crop Image"
          description="Adjust the crop area and apply."
          className="max-w-lg"
        >
          <CropModal
            imageUrl={cropImageUrl}
            shape={cropConfig.shape}
            aspect={cropConfig.aspect}
            outputSize={cropConfig.outputSize}
            onComplete={(blob) => {
              handleCropComplete(blob)
            }}
            onCancel={() => {
              handleCropCancel()
            }}
          />
        </DkDialog>
      )
    } else {
      cropCloseRef.current?.()
      cropCloseRef.current = null
    }
    return () => {
      cropCloseRef.current?.()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cropImageUrl])

  const openFilePicker = () => fileInputRef.current?.click()

  const uploadAndSubmit = async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const { data } = await apiClient.post('/upload', formData)
      const finalUrl = normalizeUploadedUrl(data.url)
      onSubmit(finalUrl)
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (err as { message?: string })?.message ??
        'Upload failed. Try a different file or paste a URL.'
      setError(msg)
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
    // Reset input value so same file can be re-selected
    e.target.value = ''
    const objectUrl = URL.createObjectURL(file)
    if (cropConfig) {
      if (cropImageUrl) URL.revokeObjectURL(cropImageUrl)
      setCropImageUrl(objectUrl)
    } else {
      setSelectedFile(file)
      setPreviewObjectUrl(objectUrl)
    }
  }

  const handleCropComplete = async (blob: Blob) => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
    const croppedFile = new File([blob], 'cropped.webp', { type: 'image/webp' })
    setSelectedFile(croppedFile)
    setPreviewObjectUrl(URL.createObjectURL(blob))
    setCropImageUrl(null)
    await uploadAndSubmit(croppedFile)
  }

  const handleCropCancel = () => {
    if (cropImageUrl) URL.revokeObjectURL(cropImageUrl)
    setCropImageUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleApply = async () => {
    if (mode === 'file' && selectedFile) {
      await uploadAndSubmit(selectedFile)
    } else if (mode === 'url') {
      onSubmit(urlDraft.trim())
    }
  }

  const showPreview = mode === 'file' && previewObjectUrl
  const showCurrentUrl = mode === 'file' && value && !previewObjectUrl

  return (
    <>
      <div className="space-y-4">
        {/* Hidden file input — always mounted so click always works */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Mode toggle */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => { setMode('file'); setUrlDraft(value) }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              mode === 'file' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white',
            )}
          >
            Upload
          </button>
          <button
            type="button"
            onClick={() => { setMode('url'); setUrlDraft(value) }}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              mode === 'url' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white',
            )}
          >
            URL
          </button>
        </div>

        {/* Body */}
        {mode === 'file' ? (
          <div className="space-y-3">
            {showPreview || showCurrentUrl ? (
              <div className="relative overflow-hidden rounded-xl bg-black/40 cursor-pointer group" onClick={openFilePicker}>
                <img
                  src={showPreview ? previewObjectUrl! : value}
                  alt="Preview"
                  className="h-36 w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs font-medium text-white">Click to change</span>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                {selectedFile && (
                  <p className="absolute left-3 bottom-3 text-[11px] font-medium text-white/60">
                    {selectedFile.name}
                  </p>
                )}
              </div>
            ) : (
              <div
                onClick={openFilePicker}
                className={cn(
                  'flex cursor-pointer flex-col items-center justify-center rounded-xl outline-2 outline-dashed outline-white/10 hover:outline-white/15 hover:bg-white/5 transition-colors',
                  compact ? 'h-24 gap-1.5' : 'h-32 gap-2',
                )}
                style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04]">
                  <Image className={cn('text-white/25', compact ? 'h-5 w-5' : 'h-6 w-6')} />
                </div>
                <span className="text-xs font-medium text-white/40">Click to select image</span>
                <span className="text-[11px] text-white/20">PNG, JPEG, WebP, GIF — max 5MB</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
                setSelectedFile(null)
                setPreviewObjectUrl(null)
                setMode('url')
                setUrlDraft(value)
              }}
              className="text-xs text-white/35 underline underline-offset-4 decoration-white/20 hover:text-white/60 hover:decoration-white/40 transition-colors"
            >
              or paste a URL instead
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              type="url"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="w-full rounded-xl px-3.5 h-10 text-sm outline-none transition-all bg-white/[0.04] text-white focus:bg-white/[0.06] focus:shadow-[0_0_0_1px_rgba(255,255,255,0.1)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApply()
              }}
              spellCheck={false}
              autoFocus
            />

            <button
              type="button"
              onClick={() => setMode('file')}
              className="text-xs text-white/35 underline underline-offset-4 decoration-white/20 hover:text-white/60 hover:decoration-white/40 transition-colors"
            >
              or upload a file instead
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg px-3 py-2 text-xs text-red-400/90 bg-red-400/5 shadow-[inset_0_0_0_1px_rgba(248,113,113,0.1)]">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <DkButton
            type="button"
            size="sm"
            variant="primary"
            onClick={handleApply}
            loading={uploading}
            disabled={mode === 'file' ? !selectedFile : !urlDraft.trim()}
          >
            {uploading ? 'Uploading...' : 'Apply'}
          </DkButton>
          {value && (
            <DkButton
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onRemove?.()}
              className="text-red-400/70 hover:text-red-400"
            >
              Remove
            </DkButton>
          )}
        </div>
      </div>
    </>
  )
}

export function SettingsProfilePage() {
  const { user, isAuthenticated, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '')
  const [backgroundUrl, setBackgroundUrl] = useState(user?.backgroundUrl ?? '')
  const [bio, setBio] = useState(user?.bio ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [steamVisibility, setSteamVisibility] = useState(
    user?.integrationVisibility?.steam ?? 'hidden'
  )
  const [plexVisibility, setPlexVisibility] = useState(
    user?.integrationVisibility?.plex ?? 'hidden'
  )
  const [tmdbVisibility, setTmdbVisibility] = useState(
    user?.integrationVisibility?.tmdb ?? 'hidden'
  )
  const [country, setCountry] = useState(user?.country ?? '')
  const [showAdultContent, setShowAdultContent] = useState(user?.showAdultContent ?? false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [initialized, setInitialized] = useState(false)

  const { openModal } = useModal()

  const handleEditCover = () => {
    const close = openModal(
      <DkDialog
        open={true}
        onOpenChange={() => close()}
        title="Cover Image"
        description="Upload or paste a URL for your cover image."
      >
        <AssetEditor
          value={backgroundUrl}
          onSubmit={(url) => {
            applyCoverEditor(url)
            close()
          }}
          onRemove={() => {
            removeCover()
            close()
          }}
          cropConfig={{ shape: 'rect', aspect: 16 / 9, outputSize: { width: 1200, height: 675 } }}
        />
      </DkDialog>
    )
  }

  const handleEditAvatar = () => {
    const close = openModal(
      <DkDialog
        open={true}
        onOpenChange={() => close()}
        title="Avatar Image"
        description="Upload or paste a URL for your avatar."
      >
        <AssetEditor
          compact
          value={avatarUrl}
          onSubmit={(url) => {
            applyAvatarEditor(url)
            close()
          }}
          onRemove={() => {
            removeAvatar()
            close()
          }}
          cropConfig={{ shape: 'round', aspect: 1, outputSize: { width: 400, height: 400 } }}
        />
      </DkDialog>
    )
  }

  useEffect(() => {
    if (user && !initialized) {
      setAvatarUrl(user.avatarUrl ?? '')
      setBackgroundUrl(user.backgroundUrl ?? '')
      setBio(user.bio ?? '')
      setUsername(user.username ?? '')
      setSteamVisibility(user.integrationVisibility?.steam ?? 'hidden')
      setPlexVisibility(user.integrationVisibility?.plex ?? 'hidden')
      setTmdbVisibility(user.integrationVisibility?.tmdb ?? 'hidden')
      setCountry(user.country ?? '')
      setInitialized(true)
    }
  }, [user, initialized])

  // Auto-dismiss save bar after 2 seconds
  useEffect(() => {
    if (!saved) return
    const t = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(t)
  }, [saved])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      const { data } = await apiClient.patch('/auth/me', {
        username: username || null,
        bio: bio || null,
        avatar_url: avatarUrl || null,
        background_url: backgroundUrl || null,
        integration_visibility: integrationVisibility,
        country: country || null,
      })
      setBio(data.bio ?? '')
      setAvatarUrl(data.avatarUrl ?? '')
      setBackgroundUrl(data.backgroundUrl ?? '')
      setUsername(data.username ?? '')
      setSaved(true)
      refreshUser()
      toast({
        title: 'Profile saved',
        description: 'Your changes have been saved.',
        variant: 'success',
      })
      // Invalidate profile queries so public pages reflect changes
      queryClient.invalidateQueries({ queryKey: ['user'] })
      if (user?.username && data.username !== user.username) {
        queryClient.invalidateQueries({ queryKey: ['user', user.username] })
      }
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        (err as { message?: string })?.message ??
        'Failed to save profile'
      toast({
        title: 'Failed to save',
        description: typeof msg === 'string' ? msg : 'An error occurred while saving your profile.',
        variant: 'error',
      })
    } finally {
      setSaving(false)
    }
  }

  const integrationVisibility = { steam: steamVisibility, plex: plexVisibility, tmdb: tmdbVisibility }

  const hasChanges = Boolean(
    user && (
      username.trim() !== (user.username ?? '').trim() ||
      bio.trim() !== (user.bio ?? '').trim() ||
      avatarUrl !== (user.avatarUrl ?? '') ||
      backgroundUrl !== (user.backgroundUrl ?? '') ||
      country !== (user.country ?? '') ||
      steamVisibility !== (user.integrationVisibility?.steam ?? 'hidden') ||
      plexVisibility !== (user.integrationVisibility?.plex ?? 'hidden') ||
      tmdbVisibility !== (user.integrationVisibility?.tmdb ?? 'hidden')
    )
  )

  const handleDiscard = () => {
    if (!user) return
    setAvatarUrl(user.avatarUrl ?? '')
    setBackgroundUrl(user.backgroundUrl ?? '')
    setBio(user.bio ?? '')
    setUsername(user.username ?? '')
    setSteamVisibility(user.integrationVisibility?.steam ?? 'hidden')
    setPlexVisibility(user.integrationVisibility?.plex ?? 'hidden')
    setTmdbVisibility(user.integrationVisibility?.tmdb ?? 'hidden')
    setCountry(user.country ?? '')
  }

  useSettingsSaveBar({
    hasChanges: Boolean(hasChanges),
    onSave: handleSave,
    onDiscard: handleDiscard,
    saving,
    saved,
    label: 'Save Profile',
  })

  if (!isAuthenticated || !user) {
    return (
      <SettingsLockedState
        title="Unlock Your Otix Profile"
        description="Create an account to customize your profile, set avatar and background banners, choose privacy levels, and share your favorite media collections."
        icon={User}
        primaryLabel="Sign In"
        secondaryLabel="Create Free Account"
        secondaryTo="/auth/register"
      />
    )
  }

  const applyCoverEditor = async (url: string) => {
    setBackgroundUrl(url)
    try {
      await apiClient.patch('/auth/me', { background_url: url || null })
      refreshUser()
      queryClient.invalidateQueries({ queryKey: ['user'] })
      toast({
        title: 'Cover updated',
        description: 'Your profile cover banner has been updated.',
        variant: 'success',
      })
    } catch (err: unknown) {
      console.error('Failed to auto-save cover:', err)
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({
        title: 'Failed to save cover',
        description: typeof msg === 'string' ? msg : 'An error occurred while saving.',
        variant: 'error',
      })
    }
  }

  const applyAvatarEditor = async (url: string) => {
    setAvatarUrl(url)
    try {
      await apiClient.patch('/auth/me', { avatar_url: url || null })
      refreshUser()
      queryClient.invalidateQueries({ queryKey: ['user'] })
      toast({
        title: 'Avatar updated',
        description: 'Your profile avatar has been updated.',
        variant: 'success',
      })
    } catch (err: unknown) {
      console.error('Failed to auto-save avatar:', err)
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      toast({
        title: 'Failed to save avatar',
        description: typeof msg === 'string' ? msg : 'An error occurred while saving.',
        variant: 'error',
      })
    }
  }

  const removeCover = async () => {
    setBackgroundUrl('')
    try {
      await apiClient.patch('/auth/me', { background_url: null })
      refreshUser()
      queryClient.invalidateQueries({ queryKey: ['user'] })
      toast({
        title: 'Cover removed',
        description: 'Your profile cover banner has been removed.',
        variant: 'success',
      })
    } catch (err: unknown) {
      console.error('Failed to remove cover:', err)
    }
  }

  const removeAvatar = async () => {
    setAvatarUrl('')
    try {
      await apiClient.patch('/auth/me', { avatar_url: null })
      refreshUser()
      queryClient.invalidateQueries({ queryKey: ['user'] })
      toast({
        title: 'Avatar removed',
        description: 'Your profile avatar has been removed.',
        variant: 'success',
      })
    } catch (err: unknown) {
      console.error('Failed to remove avatar:', err)
    }
  }

  return (
    <div id="settings-profile-section" className="space-y-5">
      <SectionHeader
        variant="page"
        icon={User}
        title="Profile"
        description="Public avatar, cover, bio, and privacy."
      />

      {/* Cover + Profile — cover fills the whole card */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          background: backgroundUrl
            ? `url(${backgroundUrl}) center/cover no-repeat`
            : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        }}
      >
        {/* Gradient atmosphere over the full card */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 via-40% to-black/70 pointer-events-none" />

        {/* Cover hover overlay — covers full card, behind bio/sections */}
        <button
          onClick={handleEditCover}
          className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40"
        >
          <div className="flex items-center gap-2 text-white">
            <Pencil className="h-5 w-5" />
            <span className="text-sm font-medium">Change Cover</span>
          </div>
        </button>

        {/* Cover area — pointer-events-none so hover reaches overlay button behind */}
        <div className="relative h-40 pointer-events-none">
        </div>

        {/* Avatar + name + bio — glass overlay */}
        <div className="relative bg-gradient-to-b from-transparent via-black/30 to-black/60 px-6 pb-6 pt-4 rounded-b-2xl">
          <div className="flex items-end gap-4" style={{ marginTop: '-4rem' }}>
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="rounded-full ring-4 ring-white/10">
                <DkAvatar src={avatarUrl || null} name={user.username} size="xl" />
              </div>
              <button
                onClick={handleEditAvatar}
                className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 hover:opacity-100 transition-opacity"
                style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
              >
                <Pencil className="h-4 w-4 text-white" />
              </button>
            </div>

            <div className="pb-1 min-w-0 flex-1 relative z-10">
              <h3 className="text-lg font-bold text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
                {username}
                {user.isAdmin && (
                  <Shield className="h-4 w-4 inline-block ml-1.5 text-amber-400/80" />
                )}
              </h3>
              <a
                href={`/user/${username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-white/40 hover:text-primary transition-colors"
              >
                View public profile →
              </a>
            </div>
          </div>

          {/* Bio */}
          <div className="mt-5">
            <div className="relative">
              <textarea
                id="profile-bio"
                value={bio}
                onChange={(e) => {
                  if (e.target.value.length <= BIO_MAX_LENGTH) setBio(e.target.value)
                }}
                placeholder="Write a short bio..."
                rows={4}
                className="w-full resize-none rounded-2xl px-4 py-3 text-sm bg-white/[0.06] text-white focus:outline-none focus:bg-white/[0.1]"
                style={{ backdropFilter: 'blur(4px)' }}
              />
              <span
                className={cn(
                  'absolute bottom-3 right-2 rounded-full px-2 py-0.5 tabular-nums text-[11px]',
                  bio.length > BIO_MAX_LENGTH * 0.85
                    ? 'text-[var(--primary)]'
                    : 'text-white/50',
                )}
                style={{
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(4px)',
                }}
              >
                {bio.length}/{BIO_MAX_LENGTH}
              </span>
            </div>
            <p className="mt-2 text-[11px] text-white/40">
              Keep it short. This appears on your public profile.
            </p>
          </div>
        </div>
      </div>

      {/* Profile Settings — consolidated */}
      <SettingsCard>
        <div className="space-y-1">
          {/* Username */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-white">Username</p>
              <p className="text-xs text-white/60 mt-0.5">
                <a
                  href={`/user/${username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <Link2 className="h-3 w-3" />
                  View Profile
                </a>
              </p>
            </div>
            <input
              id="profile-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-64 text-sm text-white text-right outline-none h-9 rounded-xl bg-white/5 px-3 placeholder:text-white/30"
              maxLength={32}
            />
          </div>

          {/* Country */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-white">Country</p>
            </div>
            <div className="w-64">
              <DkDropdown
                options={COUNTRY_OPTIONS}
                value={country}
                onChange={setCountry}
                placeholder="Select country"
              />
            </div>
          </div>

          {/* Adult content */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-white">Show 18+ Content</p>
              <p className="text-xs text-white/60 mt-0.5">
                Include adult-rated media in search results.
              </p>
            </div>
            <div className="flex-shrink-0">
              <DkSwitch
                checked={showAdultContent}
                onCheckedChange={async (checked) => {
                  setShowAdultContent(checked)
                  try {
                    await apiClient.patch('/auth/me', { show_adult_content: checked })
                    await refreshUser()
                    await queryClient.invalidateQueries({ queryKey: ['user'] })
                    await queryClient.invalidateQueries({ queryKey: ['discover'] })
                  } catch { setShowAdultContent(!checked) }
                }}
              />
            </div>
          </div>
        </div>
      </SettingsCard>

      {/* Integration visibility — separate section outside the profile card */}
      {(user.steamId || user.plexId || user.tmdbUsername) && (
        <SettingsCard>
          <SectionHeader
            title="Integrations visibility"
            description="Choose which connected accounts appear on your public profile."
          />
          <div className="space-y-4 mt-4">
            {user.steamId && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-white">Steam</span>
                <DkDropdown
                  options={VISIBILITY_OPTIONS}
                  value={steamVisibility}
                  onChange={setSteamVisibility}
                />
              </div>
            )}
            {user.plexId && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-white">Plex</span>
                <DkDropdown
                  options={VISIBILITY_OPTIONS}
                  value={plexVisibility}
                  onChange={setPlexVisibility}
                />
              </div>
            )}
            {user.tmdbUsername && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-white">TMDb</span>
                <DkDropdown
                  options={VISIBILITY_OPTIONS}
                  value={tmdbVisibility}
                  onChange={setTmdbVisibility}
                />
              </div>
            )}
          </div>
        </SettingsCard>
      )}
    </div>
  )
}
