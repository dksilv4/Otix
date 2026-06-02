import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from '@tanstack/react-router'
import { useAuth } from '@/features/auth/auth-provider'
import { apiClient } from '@/lib/api-client'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { cn } from '@/lib/utils'
import { CropModal } from '@/features/settings/molecules/crop-modal'
import { User, Pencil, Shield, GripVertical, Upload, Link2, X, Image } from 'lucide-react'

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

const PROFILE_SECTION_OPTIONS = [
 { id: 'reviews', label: 'Reviews', description: 'Show your written reviews' },
 { id: 'stats', label: 'Activity Stats', description: 'XP, review count, and activity breakdown' },
 { id: 'top_rated', label: 'Top Rated', description: 'Your highest-rated media items' },
 { id: 'recent_activity', label: 'Recent Activity', description: 'Timeline of recent actions' },
] as const

export function SectionHeader({ title, description }: { title: string; description: string }) {
 return (
 <div className="mb-5">
 <h3 className="text-base font-semibold">{title}</h3>
 <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
 </div>
 )
}

type SectionOption = (typeof PROFILE_SECTION_OPTIONS)[number]

function ReorderableSectionList({
 profileSections,
 onChange,
}: {
 profileSections: string[]
 onChange: React.Dispatch<React.SetStateAction<string[]>>
}) {
 const dragIndex = useRef<number | null>(null)

 const displayOrder: (SectionOption & { enabled: boolean })[] = [
 ...profileSections
 .map((id) => PROFILE_SECTION_OPTIONS.find((o) => o.id === id))
 .filter((o): o is SectionOption => o != null)
 .map((o) => ({ ...o, enabled: true })),
 ...PROFILE_SECTION_OPTIONS.filter((o) => !profileSections.includes(o.id)).map((o) => ({
 ...o,
 enabled: false,
 })),
 ]

 return (
 <div className="space-y-1.5 mt-4">
 {displayOrder.map((option, index) => {
 const isFirstDisabled = !option.enabled && displayOrder[index - 1]?.enabled

 return (
 <div key={option.id}>
 {isFirstDisabled && (
 <div className="flex items-center gap-3 px-4 py-2">
 <div className="flex-1 h-px bg-border/30" />
 <span className="text-[10px] uppercase tracking-wider text-muted-foreground/50">
 Hidden
 </span>
 <div className="flex-1 h-px bg-border/30" />
 </div>
 )}
 <div
 draggable={option.enabled}
 onDragStart={(e) => {
 if (!option.enabled) {
 e.preventDefault()
 return
 }
 e.dataTransfer.effectAllowed = 'move'
 dragIndex.current = index
 ;(e.currentTarget as HTMLElement).style.opacity = '0.4'
 }}
 onDragOver={(e) => {
 e.preventDefault()
 e.dataTransfer.dropEffect = 'move'
 }}
 onDrop={(e) => {
 e.preventDefault()
 const from = dragIndex.current
 dragIndex.current = null
 if (from == null || from === index) return

 const fromItem = displayOrder[from]
 const toItem = option
 if (!fromItem.enabled || !toItem.enabled) return

 onChange((prev) => {
 const next = [...prev]
 const fromPos = next.indexOf(fromItem.id)
 const toPos = next.indexOf(toItem.id)
 if (fromPos === -1 || toPos === -1) return prev
 const [moved] = next.splice(fromPos, 1)
 next.splice(toPos, 0, moved)
 return next
 })
 }}
 onDragEnd={(e) => {
 ;(e.currentTarget as HTMLElement).style.opacity = '1'
 dragIndex.current = null
 }}
 className={cn(
 'grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 transition-colors group',
 option.enabled
 ? 'hover:bg-[var(--dk-surface-glass)]'
 : 'opacity-40',
 )}
 >
 <div
 className={cn(
 option.enabled ? 'cursor-grab active:cursor-grabbing' : '',
 )}
 >
 <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
 </div>

 <div className="min-w-0">
 <p className="text-sm font-medium">{option.label}</p>
 <p className="text-xs text-muted-foreground truncate">{option.description}</p>
 </div>

 <DkSwitch
 checked={option.enabled}
 onCheckedChange={(checked) => {
 onChange((prev) =>
 checked ? [...prev, option.id] : prev.filter((id) => id !== option.id),
 )
 }}
 />
 </div>
 </div>
 )
 })}
 </div>
 )
}

function AssetEditor({
 compact = false,
 label,
 onCancel,
 onSubmit,
 onRemove,
 value,
 cropConfig,
}: {
 compact?: boolean
 label: string
 onCancel: () => void
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

 useEffect(() => {
 return () => {
 if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
 if (cropImageUrl) URL.revokeObjectURL(cropImageUrl)
 }
 }, [previewObjectUrl, cropImageUrl])

 const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0]
 if (!file) return
 const objectUrl = URL.createObjectURL(file)
 if (cropConfig) {
 if (cropImageUrl) URL.revokeObjectURL(cropImageUrl)
 setCropImageUrl(objectUrl)
 } else {
 if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
 setSelectedFile(file)
 setPreviewObjectUrl(objectUrl)
 }
 }

 const handleCropComplete = (blob: Blob) => {
 if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
 const croppedFile = new File([blob], 'cropped.webp', { type: 'image/webp' })
 setSelectedFile(croppedFile)
 setPreviewObjectUrl(URL.createObjectURL(blob))
 setCropImageUrl(null)
 }

 const handleCropCancel = () => {
 if (cropImageUrl) URL.revokeObjectURL(cropImageUrl)
 setCropImageUrl(null)
 fileInputRef.current && (fileInputRef.current.value = '')
 }

 const handleApply = async () => {
 if (mode === 'file' && selectedFile) {
 setUploading(true)
 setError(null)
 try {
 const formData = new FormData()
 formData.append('file', selectedFile)
 const { data } = await apiClient.post('/upload', formData)
 onSubmit(data.url)
 } catch (err: unknown) {
 const msg =
 (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
 (err as { message?: string })?.message ??
 'Upload failed. Try a different file or paste a URL.'
 setError(msg)
 } finally {
 setUploading(false)
 }
 } else if (mode === 'url') {
 onSubmit(urlDraft.trim())
 }
 }

 const showPreview = mode === 'file' && previewObjectUrl
 const showCurrentUrl = mode === 'file' && value && !previewObjectUrl

 return (
 <>
 {cropImageUrl && cropConfig && createPortal(
 <div
 className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
 onClick={handleCropCancel}
 >
 <div onClick={(e) => e.stopPropagation()}>
 <CropModal
 imageUrl={cropImageUrl}
 shape={cropConfig.shape}
 aspect={cropConfig.aspect}
 outputSize={cropConfig.outputSize}
 onComplete={handleCropComplete}
 onCancel={handleCropCancel}
 />
 </div>
 </div>,
 document.body,
 )}
 <div
 className={cn(
 'rounded-2xl bg-black/80 p-5 text-white shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 origin-top duration-150',
 compact ? 'w-80' : 'w-full',
 )}
 >
 {/* Header */}
 <div className="flex items-start gap-3 mb-4">
 <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/[0.06]">
 {mode === 'file' ? <Upload className="h-4 w-4 text-white/60" /> : <Link2 className="h-4 w-4 text-white/60" />}
 </div>
 <div className="min-w-0">
 <p className="text-sm font-semibold text-white tracking-[-0.01em]">{label}</p>
 <p className="text-[12px] text-white/45 mt-0.5">
 {mode === 'file' ? 'Pick an image file to upload.' : 'Paste an image URL.'}
 </p>
 </div>
 <button
 onClick={onCancel}
 className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-white/40 hover:bg-white/[0.08] hover:text-white/70 transition-colors"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 </div>

 {/* Body */}
 {mode === 'file' ? (
 <div className="space-y-3">
 {showPreview || showCurrentUrl ? (
 <div className="relative overflow-hidden rounded-xl bg-black/40">
 <img
 src={showPreview ? previewObjectUrl! : value}
 alt="Preview"
 className="h-36 w-full object-cover"
 />
 <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
 <button
 onClick={() => {
 if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
 setSelectedFile(null)
 setPreviewObjectUrl(null)
 fileInputRef.current && (fileInputRef.current.value = '')
 }}
 className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg bg-black/60 text-white/60 hover:bg-black/80 hover:text-white transition-all backdrop-blur-sm"
 >
 <X className="h-3.5 w-3.5" />
 </button>
 {selectedFile && (
 <p className="absolute left-3 bottom-3 text-[11px] text-white/60 font-medium">
 {selectedFile.name}
 </p>
 )}
 </div>
 ) : (
 <label
 className={cn(
 'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-white/[0.08] bg-white/[0.02] transition-all hover:border-primary/30 hover:bg-white/[0.04]',
 compact ? 'h-24 gap-1.5' : 'h-32 gap-2',
 )}
 >
 <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04]">
 <Image className={cn('text-white/25', compact ? 'h-5 w-5' : 'h-6 w-6')} />
 </div>
 <span className="text-[12px] text-white/40 font-medium">Click to select image</span>
 <span className="text-[11px] text-white/20">PNG, JPEG, WebP, GIF — max 5MB</span>
 <input
 ref={fileInputRef}
 type="file"
 accept="image/png,image/jpeg,image/webp,image/gif"
 onChange={handleFileSelect}
 className="hidden"
 />
 </label>
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
 className="text-[12px] text-white/35 hover:text-white/60 transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/40"
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
 className={cn(
 'w-full rounded-xl bg-white/[0.04] px-3.5 text-sm text-white outline-none transition-all',
 compact ? 'h-10' : 'h-11',
 'placeholder:text-white/25 focus:border-primary/40 focus:bg-white/[0.06] focus:ring-1 focus:ring-primary/30',
 )}
 onKeyDown={(e) => {
 if (e.key === 'Enter') handleApply()
 if (e.key === 'Escape') onCancel()
 }}
 spellCheck={false}
 autoFocus
 />

 <button
 type="button"
 onClick={() => setMode('file')}
 className="text-[12px] text-white/35 hover:text-white/60 transition-colors underline underline-offset-4 decoration-white/20 hover:decoration-white/40"
 >
 or upload a file instead
 </button>
 </div>
 )}

 {/* Error */}
 {error && (
 <p className="mt-4 text-[12px] text-red-400/90 bg-red-400/5 rounded-lg px-3 py-2 border border-red-400/10">
 {error}
 </p>
 )}

 {/* Footer */}
 <div className="mt-5 pt-4 border-t border-white/[0.06] flex items-center justify-between gap-2">
 <p className="text-[11px] text-white/25">
 {mode === 'file' ? 'Pick a file and apply.' : 'Enter applies. Escape cancels.'}
 </p>
 <div className="flex items-center gap-2">
 {value && (
 <DkButton
 type="button"
 size="sm"
 variant="outline"
 onClick={() => onRemove?.() ?? onSubmit('')}
 className="text-red-400/70 hover:text-red-400 border-red-400/10 hover:border-red-400/30"
 >
 Remove
 </DkButton>
 )}
 <DkButton
 type="button"
 size="sm"
 variant="outline"
 onClick={onCancel}
 className="text-white/60 hover:text-white"
 >
 Cancel
 </DkButton>
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
 </div>
 </div>
 </div>
 </>
 )
}

export function ProfileSection({
 user,
 isAuthenticated,
}: {
 user: {
 email: string
 username: string
 isAdmin?: boolean
 bio?: string | null
 avatarUrl?: string | null
 backgroundUrl?: string | null
 steamId?: string | null
 plexId?: string | null
 tmdbUsername?: string | null
 country?: string | null
 integrationVisibility?: Record<string, string> | null
 profileCardSections?: string[] | null
 } | null
 isAuthenticated: boolean
}) {
 const { refreshUser } = useAuth()
 const location = useLocation()
 const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? '')
 const [backgroundUrl, setBackgroundUrl] = useState(user?.backgroundUrl ?? '')
 const [bio, setBio] = useState(user?.bio ?? '')
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
 const [profileSections, setProfileSections] = useState<string[]>(
 user?.profileCardSections ?? ['reviews', 'stats', 'top_rated', 'recent_activity'],
 )
 const [saving, setSaving] = useState(false)
 const [saved, setSaved] = useState(false)
 const [editingAvatar, setEditingAvatar] = useState(false)
 const [editingCover, setEditingCover] = useState(false)
 const [initialized, setInitialized] = useState(false)

 useEffect(() => {
 if (user && !initialized) {
 setAvatarUrl(user.avatarUrl ?? '')
 setBackgroundUrl(user.backgroundUrl ?? '')
 setBio(user.bio ?? '')
 setSteamVisibility(user.integrationVisibility?.steam ?? 'hidden')
 setPlexVisibility(user.integrationVisibility?.plex ?? 'hidden')
 setTmdbVisibility(user.integrationVisibility?.tmdb ?? 'hidden')
 setCountry(user.country ?? '')
 setProfileSections(user.profileCardSections ?? ['reviews', 'stats', 'top_rated', 'recent_activity'])
 setInitialized(true)
 }
 }, [user, initialized])

 if (!isAuthenticated || !user) {
 return (
 <div className="space-y-4 rounded-2xl bg-[var(--dk-surface-base)] p-12 text-center shadow-[var(--dk-shadow-sm)]">
 <User className="h-8 w-8 mx-auto text-muted-foreground/40" />
 <div>
 <p className="text-sm font-medium">Sign in required</p>
 <p className="text-xs text-muted-foreground mt-1">Sign in to customize your profile.</p>
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
 bio: bio || null,
 avatar_url: avatarUrl || null,
 background_url: backgroundUrl || null,
 integration_visibility: integrationVisibility,
 profile_card_sections: profileSections,
 country: country || null,
 })
 setBio(data.bio ?? '')
 setAvatarUrl(data.avatarUrl ?? '')
 setBackgroundUrl(data.backgroundUrl ?? '')
 setSaved(true)
 refreshUser()
 } catch {
 // leave fields as-is
 } finally {
 setSaving(false)
 }
 }

 const integrationVisibility = { steam: steamVisibility, plex: plexVisibility, tmdb: tmdbVisibility }

 const hasChanges =
 bio !== (user?.bio ?? '') ||
 avatarUrl !== (user?.avatarUrl ?? '') ||
 backgroundUrl !== (user?.backgroundUrl ?? '') ||
 steamVisibility !== (user?.integrationVisibility?.steam ?? 'hidden') ||
 plexVisibility !== (user?.integrationVisibility?.plex ?? 'hidden') ||
 tmdbVisibility !== (user?.integrationVisibility?.tmdb ?? 'hidden') ||
 country !== (user?.country ?? '') ||
 JSON.stringify(profileSections) !== JSON.stringify(user?.profileCardSections ?? ['reviews', 'stats', 'top_rated', 'recent_activity'])

 const applyCoverEditor = async (url: string, keepOpen = false) => {
 setBackgroundUrl(url)
 if (!keepOpen) setEditingCover(false)
 setSaving(true)
 try {
 const { data } = await apiClient.patch('/auth/me', {
 bio: bio || null,
 avatar_url: avatarUrl || null,
 background_url: url || null,
 integration_visibility: integrationVisibility,
 profile_card_sections: profileSections,
 country: country || null,
 })
 setBio(data.bio ?? '')
 setAvatarUrl(data.avatarUrl ?? '')
 setBackgroundUrl(data.backgroundUrl ?? '')
 setSaved(true)
 refreshUser()
 } catch {
 // leave fields as-is
 } finally {
 setSaving(false)
 }
 }

 const applyAvatarEditor = async (url: string, keepOpen = false) => {
 setAvatarUrl(url)
 if (!keepOpen) setEditingAvatar(false)
 setSaving(true)
 try {
 const { data } = await apiClient.patch('/auth/me', {
 bio: bio || null,
 avatar_url: url || null,
 background_url: backgroundUrl || null,
 integration_visibility: integrationVisibility,
 profile_card_sections: profileSections,
 country: country || null,
 })
 setBio(data.bio ?? '')
 setAvatarUrl(data.avatarUrl ?? '')
 setBackgroundUrl(data.backgroundUrl ?? '')
 setSaved(true)
 refreshUser()
 } catch {
 // leave fields as-is
 } finally {
 setSaving(false)
 }
 }

 return (
 <div className="space-y-6">
 <div>
 <h2 className="text-lg font-semibold tracking-[-0.01em]">Profile</h2>
 <p className="text-sm text-muted-foreground mt-1">Customize your public profile.</p>
 </div>

 {/* Cover + Profile — cover fills the whole card */}
 <div
 className="relative rounded-3xl shadow-[var(--dk-shadow-md)]"
 style={{
 background: backgroundUrl
 ? `url(${backgroundUrl}) center/cover no-repeat`
 : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
 }}
 >
 {/* Gradient atmosphere over the full card */}
 <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-black/30 via-black/10 via-40% to-black/70 pointer-events-none" />

 {/* Cover area — clickable to change */}
 <div className="relative h-40 group">
 {editingCover && createPortal(
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditingCover(false)}>
 <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md">
 <AssetEditor
 label="Cover Image"
 value={backgroundUrl}
 onSubmit={(url) => applyCoverEditor(url, false)}
 onRemove={() => applyCoverEditor('', true)}
 onCancel={() => setEditingCover(false)}
 cropConfig={{ shape: 'rect', aspect: 16 / 9, outputSize: { width: 1200, height: 675 } }}
 />
 </div>
 </div>,
 document.body,
 )}
 <button
 onClick={() => setEditingCover(true)}
 className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-black/70 hover:text-white transition-all"
 >
 <Pencil className="h-3 w-3" />
 Change Cover
 </button>
 </div>

 {/* Avatar + name + bio — glass overlay */}
 <div className="relative bg-gradient-to-b from-transparent via-black/30 to-black/60 px-6 pb-6 pt-4 rounded-b-3xl">
 <div className="flex items-end gap-4 -mt-16">
 {/* Avatar */}
 <div className="relative shrink-0">
 <div className="rounded-full ring-4 ring-white/10">
 <DkAvatar src={avatarUrl || null} name={user.username} size="xl" />
 </div>
 {editingAvatar && createPortal(
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditingAvatar(false)}>
 <div onClick={(e) => e.stopPropagation()}>
 <AssetEditor
 compact
 label="Avatar Image"
 value={avatarUrl}
 onSubmit={(url) => applyAvatarEditor(url, false)}
 onRemove={() => applyAvatarEditor('', true)}
 onCancel={() => setEditingAvatar(false)}
 cropConfig={{ shape: 'round', aspect: 1, outputSize: { width: 400, height: 400 } }}
 />
 </div>
 </div>,
 document.body,
 )}
 {!editingAvatar && (
 <button
 onClick={() => setEditingAvatar(true)}
 className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 hover:opacity-100 transition-opacity"
 >
 <Pencil className="h-4 w-4 text-white" />
 </button>
 )}
 </div>

 <div className="pb-1 min-w-0 flex-1 relative z-10">
 <h3 className="text-lg font-bold text-white" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
 {user.username}
 {user.isAdmin && (
 <Shield className="h-4 w-4 inline-block ml-1.5 text-amber-400/80" />
 )}
 </h3>
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
 className="w-full resize-none rounded-2xl bg-white/[0.06] backdrop-blur-sm px-4 py-3 text-sm text-white placeholder:text-white/25 transition-colors focus:outline-none focus:bg-white/[0.10]"
 />
 <span
 className={cn(
 'absolute bottom-3 right-2 rounded-full px-2 py-0.5 text-[11px] tabular-nums bg-black/40 backdrop-blur-sm',
 bio.length > BIO_MAX_LENGTH * 0.85
 ? 'text-primary'
 : 'text-white/50',
 )}
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

 {/* Country preference */}
 <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
 <SectionHeader
 title="Country"
 description="Used to show the matching certification rating (MPAA, ESRB, etc.) on media pages."
 />
 <div className="mt-4 max-w-xs">
 <DkDropdown
 options={COUNTRY_OPTIONS}
 value={country}
 onChange={setCountry}
 placeholder="Select country"
 />
 </div>
 </div>

 {/* Integration visibility — separate section outside the profile card */}
 {(user.steamId || user.plexId || user.tmdbUsername) && (
 <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
 <SectionHeader
 title="Integrations visibility"
 description="Choose which connected accounts appear on your public profile."
 />
 <div className="space-y-4 mt-4">
 {user.steamId && (
 <div className="flex items-center justify-between gap-4">
 <span className="text-sm font-medium">Steam</span>
 <DkDropdown
 options={VISIBILITY_OPTIONS}
 value={steamVisibility}
 onChange={setSteamVisibility}
 />
 </div>
 )}
 {user.plexId && (
 <div className="flex items-center justify-between gap-4">
 <span className="text-sm font-medium">Plex</span>
 <DkDropdown
 options={VISIBILITY_OPTIONS}
 value={plexVisibility}
 onChange={setPlexVisibility}
 />
 </div>
 )}
 {user.tmdbUsername && (
 <div className="flex items-center justify-between gap-4">
 <span className="text-sm font-medium">TMDb</span>
 <DkDropdown
 options={VISIBILITY_OPTIONS}
 value={tmdbVisibility}
 onChange={setTmdbVisibility}
 />
 </div>
 )}
 </div>
 </div>
 )}

 {/* Profile sections */}
 <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-sm)]">
 <SectionHeader
 title="Profile sections"
 description="Drag to reorder. Toggle to show or hide sections on your profile."
 />
 <ReorderableSectionList
 profileSections={profileSections}
 onChange={setProfileSections}
 />
 </div>

 {/* Save */}
 <div className="flex items-center gap-3">
 <DkButton variant="primary" onClick={handleSave} loading={saving} disabled={!hasChanges}>
 Save Profile
 </DkButton>
 {saved && <span className="text-xs text-green-500 animate-in fade-in">Saved</span>}
 </div>
 </div>
 )
}
