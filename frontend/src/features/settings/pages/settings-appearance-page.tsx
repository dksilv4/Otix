import { useState, useEffect } from 'react'
import { useTheme } from '@/lib/providers/theme'
import { useShaderQuality, SHADER_QUALITY_OPTIONS } from '@/lib/providers/shader-quality'
import { useMotionPreference, MOTION_OPTIONS } from '@/lib/providers/motion-preference'
import { cn } from '@/lib/utils'
import { Moon, Sun, Monitor, Plus, PanelLeftClose, Gamepad2 } from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { LAUNCHER_THEMES, type LauncherThemeId } from '@/features/launcher/themes/theme-context'

const SETTINGS_SIDEBAR_COLLAPSED_KEY = 'otix-settings-sidebar-collapsed'

function getInitialSidebarCollapsed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(SETTINGS_SIDEBAR_COLLAPSED_KEY) === 'true'
}

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

export function SettingsAppearancePage() {
  const { theme, setTheme } = useTheme()
  const { shaderQuality, setShaderQuality } = useShaderQuality()
  const { motionPreference, setMotionPreference } = useMotionPreference()
  const [accent, setAccent] = useState<string>(getInitialAccent)
  const [customAccents, setCustomAccents] = useState<string[]>(getCustomAccents)
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getInitialSidebarCollapsed)

  useEffect(() => {
    const handleCollapseChange = () => {
      setSidebarCollapsed(getInitialSidebarCollapsed())
    }
    window.addEventListener('settings-sidebar-collapse-changed', handleCollapseChange)
    return () => window.removeEventListener('settings-sidebar-collapse-changed', handleCollapseChange)
  }, [])

  const updateSidebarCollapsed = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed)
    localStorage.setItem(SETTINGS_SIDEBAR_COLLAPSED_KEY, String(collapsed))
    window.dispatchEvent(new Event('settings-sidebar-collapse-changed'))
  }

  useEffect(() => {
    applyAccentColor(accent)
  }, [accent])

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
    <div id="settings-appearance-section" className="space-y-5">
      {/* Theme card */}
      <SettingsCard>
        <SectionHeader title="Theme" description="Choose how Otix looks on your device." />

        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl p-4 sm:p-5"
          style={{ backgroundColor: 'var(--dk-surface-raised)' }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-primary"
              style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 15%, transparent)' }}
            >
              {theme === 'dark' ? <Moon className="h-5.5 w-5.5" /> : theme === 'light' ? <Sun className="h-5.5 w-5.5" /> : <Monitor className="h-5.5 w-5.5" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'} mode
              </p>
              <p className="text-xs text-white/60 mt-0.5">
                {theme === 'dark' ? 'Easier on the eyes at night' : theme === 'light' ? 'Bright and crisp for daytime' : 'Follows your device settings'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 w-full sm:w-auto rounded-xl p-1 gap-1 bg-white/[0.04]">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={cn(
                  'rounded-lg px-3 py-2 text-xs font-medium transition-all duration-150 text-center',
                  theme === t
                    ? 'bg-white/10 text-white shadow-sm font-semibold'
                    : 'text-white/60 hover:text-white',
                )}
              >
                {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </SettingsCard>

      {/* Accent color card */}
      <SettingsCard>
        <SectionHeader title="Accent" description="Pick a color accent for the interface." />

        <div className="flex flex-wrap gap-2.5 sm:gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccent(a.primary)}
              className="relative h-9 w-9 sm:h-10 sm:w-10 rounded-full hover:scale-110 active:scale-95 transition-transform"
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
          className="flex flex-wrap gap-2.5 sm:gap-3 pt-4 mt-5"
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
                  'relative flex h-9 w-9 sm:h-10 sm:w-10 cursor-pointer items-center justify-center rounded-full hover:scale-110 active:scale-95 transition-transform',
                )}
                style={hasColor ? { backgroundColor: color } : { backgroundColor: 'var(--dk-surface-raised)' }}
                onClick={(e) => {
                  if (hasColor && !active) {
                    e.preventDefault()
                    setAccent(color)
                  }
                }}
              >
                {!hasColor && <Plus className="h-4 w-4 text-white/30 pointer-events-none" />}
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
      </SettingsCard>



      {/* Motion card */}
      <SettingsCard>
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
      </SettingsCard>

      {/* Home Background Quality card */}
      <SettingsCard>
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
      </SettingsCard>

      {/* Settings Sidebar Layout card */}
      <SettingsCard>
        <SectionHeader
          title="Settings Sidebar"
          description="Choose whether the settings menu sidebar is expanded or collapsed to icons only."
        />

        <div
          className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl p-4 sm:p-5"
          style={{ backgroundColor: 'var(--dk-surface-raised)' }}
        >
          <div className="flex items-center gap-3.5">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-primary"
              style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 15%, transparent)' }}
            >
              <PanelLeftClose className="h-5.5 w-5.5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">
                Settings Menu Mode
              </p>
              <p className="text-xs text-white/60 mt-0.5">
                {sidebarCollapsed ? 'Collapsed (Icons only)' : 'Expanded (Full labels & icons)'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 w-full sm:w-auto rounded-xl p-1 gap-1 bg-white/[0.04]">
            <button
              type="button"
              onClick={() => updateSidebarCollapsed(false)}
              className={cn(
                'rounded-lg px-4 py-2 text-xs font-medium transition-all duration-150 text-center',
                !sidebarCollapsed
                  ? 'bg-white/10 text-white shadow-sm font-semibold'
                  : 'text-white/60 hover:text-white',
              )}
            >
              Expanded
            </button>
            <button
              type="button"
              onClick={() => updateSidebarCollapsed(true)}
              className={cn(
                'rounded-lg px-4 py-2 text-xs font-medium transition-all duration-150 text-center',
                sidebarCollapsed
                  ? 'bg-white/10 text-white shadow-sm font-semibold'
                  : 'text-white/60 hover:text-white',
              )}
            >
              Icons Only
            </button>
          </div>
        </div>
      </SettingsCard>

      {/* Launcher Theme Selector Card */}
      <SettingsCard>
        <SectionHeader
          title="Game Launcher Layout & Theme"
          description="Choose the default interface theme for the Otix Game Launcher. All 10 themes read your same game library and session data."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
          {LAUNCHER_THEMES.map((t) => {
            const currentStored = typeof window !== 'undefined' ? localStorage.getItem('otix:launcher-theme') || 'modern' : 'modern'
            const isSelected = currentStored === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  localStorage.setItem('otix:launcher-theme', t.id)
                  window.dispatchEvent(new Event('storage'))
                  // Force state refresh
                  setSidebarCollapsed((prev) => !prev)
                  setSidebarCollapsed((prev) => !prev)
                }}
                className={cn(
                  'flex flex-col items-start p-3.5 rounded-xl border transition-all text-left cursor-pointer group',
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-[0_0_16px_rgba(var(--primary),0.2)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'
                )}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-white/10 text-white/80">
                      {t.version}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      BETA
                    </span>
                  </div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-primary shadow-sm" />
                  )}
                </div>
                <span className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                  {t.name}
                </span>
                <span className="text-[10px] text-white/50 font-medium mt-0.5">
                  {t.subtitle}
                </span>
              </button>
            )
          })}
        </div>
      </SettingsCard>
    </div>
  )
}
