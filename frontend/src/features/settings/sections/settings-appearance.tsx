import { useState, useEffect } from 'react'
import { useShaderQuality, SHADER_QUALITY_OPTIONS } from '@/lib/providers/shader-quality'
import { useMotionPreference, MOTION_OPTIONS } from '@/lib/providers/motion-preference'
import { useLogoPreference, LOGO_VARIANTS, type LogoVariant } from '@/lib/providers/logo-preference'
import type { ThemeSetting } from '@/lib/providers/theme'
import { cn } from '@/lib/utils'
import { Moon, Sun, Monitor, Plus, Check } from 'lucide-react'
import { Logo } from '@/old-features/dk-ui/atoms/logo'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { getThemeIds, getThemeModule } from '@/features/launcher/themes/registry'
import type { LauncherThemeManifest } from '@/features/launcher/themes/types'

const ACCENTS = [
  { id: 'orange', primary: 'oklch(0.705 0.213 47.604)' },
  { id: 'amber', primary: 'oklch(0.769 0.188 70.08)' },
  { id: 'yellow', primary: 'oklch(0.828 0.189 84.429)' },
  { id: 'lime', primary: 'oklch(0.768 0.233 130.85)' },
  { id: 'green', primary: 'oklch(0.627 0.194 149.214)' },
  { id: 'emerald', primary: 'oklch(0.596 0.145 163.225)' },
  { id: 'teal', primary: 'oklch(0.696 0.17 162.48)' },
  { id: 'cyan', primary: 'oklch(0.715 0.143 215.221)' },
  { id: 'sky', primary: 'oklch(0.685 0.169 237.323)' },
  { id: 'blue', primary: 'oklch(0.623 0.214 259.815)' },
  { id: 'indigo', primary: 'oklch(0.585 0.233 277.117)' },
  { id: 'violet', primary: 'oklch(0.606 0.25 292.717)' },
  { id: 'purple', primary: 'oklch(0.624 0.21 306.551)' },
  { id: 'fuchsia', primary: 'oklch(0.592 0.233 328.363)' },
  { id: 'pink', primary: 'oklch(0.592 0.212 350.487)' },
  { id: 'rose', primary: 'oklch(0.577 0.245 27.325)' },
] as const

const ACCENT_STORAGE_KEY = 'otix-accent'
const CUSTOM_ACCENTS_KEY = 'otix-accent-customs'

function getCustomAccents(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CUSTOM_ACCENTS_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function getInitialAccent(): string {
  if (typeof window === 'undefined') return ACCENTS[0].primary
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY)
  if (stored && typeof stored === 'string') return stored
  return ACCENTS[0].primary
}

function applyAccentColor(color: string) {
  const root = document.documentElement
  root.style.setProperty('--primary', color)
  root.style.setProperty('--ring', color)
  root.style.setProperty('--sidebar-primary', color)
  root.style.setProperty('--sidebar-ring', color)
  localStorage.setItem(ACCENT_STORAGE_KEY, color)
}

export function AppearanceSection({ theme, onSetTheme }: { theme: ThemeSetting; onSetTheme: (t: ThemeSetting) => void }) {
  const { shaderQuality, setShaderQuality } = useShaderQuality()
  const { motionPreference, setMotionPreference } = useMotionPreference()
  const { variant, setVariant } = useLogoPreference()
  const [accent, setAccent] = useState<string>(getInitialAccent)
  const [customAccents, setCustomAccents] = useState<string[]>(getCustomAccents)
  useEffect(() => {
    applyAccentColor(accent)
  }, [accent])

  const LAUNCHER_THEME_KEY = 'otix-launcher-theme'
  const [launcherThemeId, setLauncherThemeId] = useState(() => {
    try { return localStorage.getItem(LAUNCHER_THEME_KEY) || 'default' }
    catch { return 'default' }
  })
  const [themeMetas, setThemeMetas] = useState<LauncherThemeManifest[]>([])

  useEffect(() => {
    const ids = getThemeIds()
    Promise.all(ids.map(id => getThemeModule(id).then(m => m.default.meta).catch(() => null))).then(metas => {
      setThemeMetas(metas.filter((m): m is LauncherThemeManifest => m != null && m.id != null))
    })
  }, [])

  const setCustomSlot = (index: number, color: string) => {
    const next = [...customAccents]
    next[index] = color
    for (let i = 0; i < next.length; i++) {
      if (!next[i]) next[i] = ''
    }
    setCustomAccents(next)
    localStorage.setItem(CUSTOM_ACCENTS_KEY, JSON.stringify(next))
    setAccent(color)
  }

  const isActive = (color: string) => accent === color

  return (
    <div className="space-y-6">
      {/* Theme card */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader title="Theme" description="Choose how Otix looks on your device." />

        <div
          className="flex items-center justify-between rounded-xl px-4 py-4"
          style={{ backgroundColor: 'var(--dk-surface-raised)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-primary"
              style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
            >
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : theme === 'light' ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'} mode
              </p>
              <p className="text-xs text-white/60">
                {theme === 'dark' ? 'Easier on the eyes at night' : theme === 'light' ? 'Bright and crisp for daytime' : 'Follows your device settings'}
              </p>
            </div>
          </div>

          <div className="flex rounded-lg p-1 gap-0.5 bg-white/[0.03]">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSetTheme(t)}
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-colors duration-150',
                  theme === t
                    ? 'bg-white/10 text-white shadow-sm'
                    : 'text-white/60 hover:text-white',
                )}
              >
                {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Launcher Theme card */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader title="Launcher Theme" description="Change the look and feel of the game launcher." />

        <div className="grid grid-cols-4 gap-3">
          {themeMetas.map(meta => (
            <button
              key={meta.id}
              type="button"
              onClick={() => {
                setLauncherThemeId(meta.id)
                localStorage.setItem(LAUNCHER_THEME_KEY, meta.id)
              }}
              className={cn(
                'relative rounded-xl overflow-hidden aspect-[4/3] border-2 transition-all',
                launcherThemeId === meta.id
                  ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/30'
                  : 'border-white/10 hover:border-white/30',
              )}
            >
              {/* Theme preview */}
              <div className={cn(
                'w-full h-full flex items-center justify-center text-xs font-medium',
                meta.id === 'default' && 'bg-[#0a0a0d] text-white/60',
                meta.id === 'light' && 'bg-[#f8f9fa] text-black/60',
                meta.id === 'retro' && 'bg-black text-[#00ff41]/60 font-mono',
                meta.id === 'minimal' && 'bg-[#1a1a1a] text-white/40',
              )}>
                {meta.name}
              </div>
              {/* Checkmark overlay */}
              {launcherThemeId === meta.id && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[var(--primary)] flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
        {/* Selected theme description */}
        {(() => {
          const selected = themeMetas.find(m => m.id === launcherThemeId)
          return selected && (
            <p className="mt-3 text-xs text-white/50">{selected.description}</p>
          )
        })()}
      </div>

      {/* Accent color card */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader title="Accent" description="Pick a color accent for the interface." />

        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccent(a.primary)}
              className="relative h-7 w-7 rounded-full hover:scale-110 active:scale-95 transition-transform"
              style={{ backgroundColor: a.primary }}
            >
              {isActive(a.primary) && (
                <span
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    boxShadow:
                      '0 0 0 4px color-mix(in srgb, var(--foreground) 20%, transparent), 0 0 0 2px var(--dk-surface-base)',
                  }}
                />
              )}
            </button>
          ))}
        </div>

        <div
          className="flex flex-wrap gap-3 pt-4 mt-4"
          style={{ boxShadow: 'inset 0 1px 0 color-mix(in srgb, var(--border) 30%, transparent)' }}
        >
          {Array.from({ length: 16 }).map((_, i) => {
            const color = customAccents[i] || ''
            const hasColor = color.length > 0
            const active = hasColor && isActive(color)
            return (
              <label
                key={i}
                className={cn(
                  'relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full hover:scale-110 active:scale-95 transition-transform',
                )}
                style={hasColor ? { backgroundColor: color } : { backgroundColor: 'var(--dk-surface-raised)' }}
                onClick={(e) => {
                  if (hasColor && !active) {
                    e.preventDefault()
                    setAccent(color)
                  }
                }}
              >
                {!hasColor && <Plus className="h-3.5 w-3.5 text-white/30 pointer-events-none" />}
                {active && (
                  <span
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      boxShadow:
                        '0 0 0 4px color-mix(in srgb, var(--foreground) 20%, transparent), 0 0 0 2px var(--dk-surface-base)',
                    }}
                  />
                )}
                <input
                  type="color"
                  value={color || '#000000'}
                  onChange={(e) => setCustomSlot(i, e.target.value)}
                  className="absolute opacity-0 cursor-pointer"
                  style={{ left: '-0.375rem', top: 0, bottom: 0, right: 0 }}
                />
              </label>
            )
          })}
        </div>
      </div>

      {/* Logo card */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Logo"
          description="Choose which Otix logo variant to display around the app."
        />

        <div className="grid grid-cols-3 gap-3">
          {LOGO_VARIANTS.map((option) => {
            const isSelected = variant === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setVariant(option.value as LogoVariant)}
                className={cn(
                  'relative flex flex-col items-center gap-3 rounded-xl p-4 transition-all duration-150',
                  'hover:bg-white/[0.06]',
                )}
                style={{
                  backgroundColor: isSelected
                    ? 'color-mix(in srgb, var(--primary) 10%, transparent)'
                    : 'var(--dk-surface-raised)',
                  boxShadow: isSelected
                    ? '0 0 0 2px var(--primary)'
                    : '0 0 0 1px transparent',
                }}
              >
                <div
                  className={cn(
                    'flex h-16 w-full items-center justify-center',
                    isSelected && 'text-primary',
                  )}
                >
                  <Logo variant={option.value as LogoVariant} className="h-full" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">{option.label}</p>
                  <p className="mt-0.5 text-[10px] leading-tight text-white/60">{option.description}</p>
                </div>
                {isSelected && (
                  <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Motion card */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Motion"
          description="Control animations and transitions across the app."
        />

        <div className="rounded-xl p-2" style={{ backgroundColor: 'var(--dk-surface-raised)' }}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {MOTION_OPTIONS.map((option) => {
              const isActiveOpt = motionPreference === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMotionPreference(option.value)}
                  className={cn(
                    'rounded-xl px-3 py-3 text-left transition-all duration-150',
                    isActiveOpt
                      ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
                      : 'hover:bg-white/[0.06]',
                  )}
                  style={!isActiveOpt ? { backgroundColor: 'var(--dk-surface-overlay)' } : undefined}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      isActiveOpt ? 'text-white/80' : 'text-white/60',
                    )}
                  >
                    {option.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Home Background Quality card */}
      <div className="rounded-2xl p-6 bg-white/5 backdrop-blur-xl">
        <SectionHeader
          title="Home Background Quality"
          description="Control the animated shader quality on the homepage, or let Otix choose automatically."
        />

        <div className="rounded-xl p-2" style={{ backgroundColor: 'var(--dk-surface-raised)' }}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {SHADER_QUALITY_OPTIONS.map((option) => {
              const isActiveOpt = shaderQuality === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setShaderQuality(option.value)}
                  className={cn(
                    'rounded-xl px-3 py-3 text-left transition-all duration-150',
                    isActiveOpt
                      ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
                      : 'hover:bg-white/[0.06]',
                  )}
                  style={!isActiveOpt ? { backgroundColor: 'var(--dk-surface-overlay)' } : undefined}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      isActiveOpt ? 'text-white/80' : 'text-white/60',
                    )}
                  >
                    {option.description}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
