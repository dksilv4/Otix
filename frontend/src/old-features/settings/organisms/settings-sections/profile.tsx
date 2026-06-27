// TODO: Review this file
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from '@tanstack/react-router'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { DkButton } from '@/old-features/ui/atoms/button'
import { DkAvatar } from '@/old-features/ui/atoms/avatar'
import { DkDropdown } from '@/old-features/ui/atoms/dropdown'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import { cn } from '@/lib/utils'
import { CropModal } from '@/old-features/settings/molecules/crop-modal'
import './profile.scss'
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
	 <div className="dk-settings-profile__section-header">
	 <h3 className="dk-settings-profile__section-header-title">{title}</h3>
	 <p className="dk-settings-profile__section-header-desc">{description}</p>
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
	 <div className="dk-settings-profile__reorder-list">
	 {displayOrder.map((option, index) => {
	 const isFirstDisabled = !option.enabled && displayOrder[index - 1]?.enabled

	 return (
	 <div key={option.id}>
	 {isFirstDisabled && (
	 <div className="dk-settings-profile__reorder-separator">
	 <div className="dk-settings-profile__reorder-separator-line" />
	 <span className="dk-settings-profile__reorder-separator-text">
	 Hidden
	 </span>
	 <div className="dk-settings-profile__reorder-separator-line" />
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
	 'dk-settings-profile__reorder-item group',
	 option.enabled
	 ? 'dk-settings-profile__reorder-item--enabled'
	 : 'dk-settings-profile__reorder-item--disabled',
	 )}
	 >
	 <div
	 className={cn(
	 option.enabled ? 'dk-settings-profile__reorder-grip' : '',
	 )}
	 >
	 <GripVertical className="h-4 w-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />
	 </div>

	 <div className="dk-settings-profile__reorder-content">
	 <p className="dk-settings-profile__reorder-label">{option.label}</p>
	 <p className="dk-settings-profile__reorder-desc">{option.description}</p>
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
	 className="dk-settings-profile__editor-modal dk-settings-profile__editor-modal--z60"
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
	 'dk-settings-profile__editor-card',
	 compact ? 'dk-settings-profile__editor-card--compact' : 'dk-settings-profile__editor-card--full',
	 )}
	 >
	 {/* Header */}
	 <div className="dk-settings-profile__editor-header">
	 <div className="dk-settings-profile__editor-icon-wrap">
	 {mode === 'file' ? <Upload className="h-4 w-4 text-white/60" /> : <Link2 className="h-4 w-4 text-white/60" />}
	 </div>
	 <div className="dk-settings-profile__editor-title-wrap">
	 <p className="dk-settings-profile__editor-title">{label}</p>
	 <p className="dk-settings-profile__editor-subtitle">
	 {mode === 'file' ? 'Pick an image file to upload.' : 'Paste an image URL.'}
	 </p>
	 </div>
	 <button
	 onClick={onCancel}
	 className="dk-settings-profile__editor-close"
	 >
	 <X className="h-3.5 w-3.5" />
	 </button>
	 </div>

	 {/* Body */}
	 {mode === 'file' ? (
	 <div className="dk-settings-profile__editor-body">
	 {showPreview || showCurrentUrl ? (
	 <div className="dk-settings-profile__editor-preview">
	 <img
	 src={showPreview ? previewObjectUrl! : value}
	 alt="Preview"
	 className="dk-settings-profile__editor-preview-img"
	 />
	 <div className="dk-settings-profile__editor-preview-gradient" />
	 <button
	 onClick={() => {
	 if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl)
	 setSelectedFile(null)
	 setPreviewObjectUrl(null)
	 fileInputRef.current && (fileInputRef.current.value = '')
	 }}
	 className="dk-settings-profile__editor-preview-remove"
	 >
	 <X className="h-3.5 w-3.5" />
	 </button>
	 {selectedFile && (
	 <p className="dk-settings-profile__editor-preview-name">
	 {selectedFile.name}
	 </p>
	 )}
	 </div>
	 ) : (
	 <label
	 className={cn(
	 'dk-settings-profile__editor-dropzone',
	 compact ? 'dk-settings-profile__editor-dropzone--compact' : 'dk-settings-profile__editor-dropzone--normal',
	 )}
	 >
	 <div className="dk-settings-profile__editor-dropzone-icon-wrap">
	 <Image className={cn('text-white/25', compact ? 'h-5 w-5' : 'h-6 w-6')} />
	 </div>
	 <span className="dk-settings-profile__editor-dropzone-text">Click to select image</span>
	 <span className="dk-settings-profile__editor-dropzone-hint">PNG, JPEG, WebP, GIF — max 5MB</span>
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
	 className="dk-settings-profile__editor-mode-switch"
	 >
	 or paste a URL instead
	 </button>
	 </div>
	 ) : (
	 <div className="dk-settings-profile__editor-body">
	 <input
	 type="url"
	 value={urlDraft}
	 onChange={(e) => setUrlDraft(e.target.value)}
	 placeholder="https://example.com/image.jpg"
	 className={cn(
	 'dk-settings-profile__editor-url-input',
	 compact ? 'dk-settings-profile__editor-url-input--compact' : 'dk-settings-profile__editor-url-input--normal',
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
	 className="dk-settings-profile__editor-mode-switch"
	 >
	 or upload a file instead
	 </button>
	 </div>
	 )}

	 {/* Error */}
	 {error && (
	 <p className="dk-settings-profile__editor-error">
	 {error}
	 </p>
	 )}

	 {/* Footer */}
	 <div className="dk-settings-profile__editor-footer">
	 <p className="dk-settings-profile__editor-footer-hint">
	 {mode === 'file' ? 'Pick a file and apply.' : 'Enter applies. Escape cancels.'}
	 </p>
	 <div className="dk-settings-profile__editor-actions">
	 {value && (
	 <DkButton
	 type="button"
	 size="sm"
	 variant="outline"
	 onClick={() => onRemove?.() ?? onSubmit('')}
	 className="dk-settings-profile__editor-remove-btn"
	 >
	 Remove
	 </DkButton>
	 )}
	 <DkButton
	 type="button"
	 size="sm"
	 variant="outline"
	 onClick={onCancel}
	 className="dk-settings-profile__editor-cancel-btn"
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
	 <div className="dk-settings-profile__signin">
	 <User className="h-8 w-8 mx-auto text-muted-foreground/40" />
	 <div>
	 <p className="dk-settings-profile__signin-title">Sign in required</p>
	 <p className="dk-settings-profile__signin-desc">Sign in to customize your profile.</p>
	 </div>
	 <Link
	 to="/auth/login"
	 search={{ redirect: location.href }}
	 className="dk-settings-profile__signin-link"
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
	 <div className="dk-settings-profile">
	 <div>
	 <h2 className="dk-settings-profile__header-title">Profile</h2>
	 <p className="dk-settings-profile__header-desc">Customize your public profile.</p>
	 </div>

	 {/* Cover + Profile — cover fills the whole card */}
	 <div
	 className="dk-settings-profile__cover"
	 style={{
	 background: backgroundUrl
	 ? `url(${backgroundUrl}) center/cover no-repeat`
	 : 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
	 }}
	 >
	 {/* Gradient atmosphere over the full card */}
	 <div className="dk-settings-profile__cover-overlay" />

	 {/* Cover area — clickable to change */}
	 <div className="dk-settings-profile__cover-image">
	 {editingCover && createPortal(
	 <div className="dk-settings-profile__editor-modal" onClick={() => setEditingCover(false)}>
	 <div onClick={(e) => e.stopPropagation()} className="dk-settings-profile__editor-inner">
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
	 className="dk-settings-profile__cover-btn"
	 >
	 <Pencil className="h-3 w-3" />
	 Change Cover
	 </button>
	 </div>

	 {/* Avatar + name + bio — glass overlay */}
	 <div className="dk-settings-profile__avatar-area">
	 <div className="dk-settings-profile__avatar-row">
	 {/* Avatar */}
	 <div className="dk-settings-profile__avatar">
	 <div className="dk-settings-profile__avatar-ring">
	 <DkAvatar src={avatarUrl || null} name={user.username} size="xl" />
	 </div>
	 {editingAvatar && createPortal(
	 <div className="dk-settings-profile__editor-modal" onClick={() => setEditingAvatar(false)}>
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
	 className="dk-settings-profile__avatar-edit"
	 >
	 <Pencil className="h-4 w-4 text-white" />
	 </button>
	 )}
	 </div>

	 <div className="dk-settings-profile__name-wrap">
	 <h3 className="dk-settings-profile__name" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}>
	 {user.username}
	 {user.isAdmin && (
	 <Shield className="h-4 w-4 inline-block ml-1.5 text-amber-400/80" />
	 )}
	 </h3>
	 </div>
	 </div>

	 {/* Bio */}
	 <div className="dk-settings-profile__bio">
	 <div className="dk-settings-profile__bio-textarea-wrap">
	 <textarea
	 id="profile-bio"
	 value={bio}
	 onChange={(e) => {
	 if (e.target.value.length <= BIO_MAX_LENGTH) setBio(e.target.value)
	 }}
	 placeholder="Write a short bio..."
	 rows={4}
	 className="dk-settings-profile__bio-textarea"
	 />
	 <span
	 className={cn(
	 'dk-settings-profile__bio-counter',
	 bio.length > BIO_MAX_LENGTH * 0.85
	 ? 'dk-settings-profile__bio-counter--warn'
	 : 'dk-settings-profile__bio-counter--default',
	 )}
	 >
	 {bio.length}/{BIO_MAX_LENGTH}
	 </span>
	 </div>
	 <p className="dk-settings-profile__bio-hint">
	 Keep it short. This appears on your public profile.
	 </p>
	 </div>
	 </div>
	 </div>

	 {/* Country preference */}
	 <div className="dk-settings-profile__section-card">
	 <SectionHeader
	 title="Country"
	 description="Used to show the matching certification rating (MPAA, ESRB, etc.) on media pages."
	 />
	 <div className="dk-settings-profile__section-card-dropdown">
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
	 <div className="dk-settings-profile__section-card">
	 <SectionHeader
	 title="Integrations visibility"
	 description="Choose which connected accounts appear on your public profile."
	 />
	 <div className="dk-settings-profile__section-card-content">
	 {user.steamId && (
	 <div className="dk-settings-profile__integration-item">
	 <span className="dk-settings-profile__integration-label">Steam</span>
	 <DkDropdown
	 options={VISIBILITY_OPTIONS}
	 value={steamVisibility}
	 onChange={setSteamVisibility}
	 />
	 </div>
	 )}
	 {user.plexId && (
	 <div className="dk-settings-profile__integration-item">
	 <span className="dk-settings-profile__integration-label">Plex</span>
	 <DkDropdown
	 options={VISIBILITY_OPTIONS}
	 value={plexVisibility}
	 onChange={setPlexVisibility}
	 />
	 </div>
	 )}
	 {user.tmdbUsername && (
	 <div className="dk-settings-profile__integration-item">
	 <span className="dk-settings-profile__integration-label">TMDb</span>
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
	 <div className="dk-settings-profile__section-card">
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
	 <div className="dk-settings-profile__save-bar">
	 <DkButton variant="primary" onClick={handleSave} loading={saving} disabled={!hasChanges}>
	 Save Profile
	 </DkButton>
	 {saved && <span className="dk-settings-profile__saved-indicator">Saved</span>}
	 </div>
	 </div>
	 )
}
