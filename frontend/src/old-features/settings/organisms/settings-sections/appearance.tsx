// TODO: Review this file
import { useState, useEffect } from 'react'
import { useShaderQuality, SHADER_QUALITY_OPTIONS } from '@/lib/shader-quality'
import { useMotionPreference, MOTION_OPTIONS } from '@/lib/motion-preference'
import { useLogoPreference, LOGO_VARIANTS, type LogoVariant } from '@/lib/logo-preference'
import type { ThemeSetting } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Moon, Sun, Monitor, Plus, Check } from 'lucide-react'
import { Logo } from '@/old-features/dk-ui/atoms/logo'
import { SectionHeader } from './profile'
import './appearance.scss'

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
    <div className="dk-settings-appearance__body">
      <div className="dk-settings-appearance__card">
        <SectionHeader title="Theme" description="Choose how Otix looks on your device." />

        <div className="dk-settings-appearance__theme-row">
          <div className="dk-settings-appearance__theme-info">
            <div className="dk-settings-appearance__theme-icon">
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : theme === 'light' ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </div>
            <div>
              <p className="dk-settings-appearance__theme-name">
                {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'} mode
              </p>
              <p className="dk-settings-appearance__theme-desc">
                {theme === 'dark' ? 'Easier on the eyes at night' : theme === 'light' ? 'Bright and crisp for daytime' : 'Follows your device settings'}
              </p>
            </div>
          </div>
          <div className="dk-settings-appearance__toggle-group">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSetTheme(t)}
                className={cn(
                  'dk-settings-appearance__toggle-btn',
                  theme === t && 'dk-settings-appearance__toggle-btn--active',
                )}
              >
                {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="dk-settings-appearance__card">
        <SectionHeader title="Accent" description="Pick a color accent for the interface." />

        <div className="dk-settings-appearance__accent-grid">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccent(a.primary)}
              className="dk-settings-appearance__accent-swatch"
              style={{ backgroundColor: a.primary }}
            >
              {isActive(a.primary) && (
                <span className="dk-settings-appearance__accent-ring" />
              )}
            </button>
          ))}
        </div>

        <div className="dk-settings-appearance__accent-customs">
          {Array.from({ length: 16 }).map((_, i) => {
            const color = customAccents[i] || ''
            const hasColor = color.length > 0
            const active = hasColor && isActive(color)
            return (
              <label
                key={i}
                className={cn(
                  'dk-settings-appearance__accent-slot',
                  !hasColor && 'dk-settings-appearance__accent-slot--empty',
                )}
                style={hasColor ? { backgroundColor: color } : undefined}
                onClick={(e) => {
                  if (hasColor && !active) {
                    e.preventDefault()
                    setAccent(color)
                  }
                }}
              >
                {!hasColor && <Plus className="h-3.5 w-3.5 text-muted-foreground/30 pointer-events-none" />}
                {active && (
                  <span className="dk-settings-appearance__accent-ring" />
                )}
                <input
                  type="color"
                  value={color || '#000000'}
                  onChange={(e) => setCustomSlot(i, e.target.value)}
                  className="dk-settings-appearance__color-picker"
                />
              </label>
            )
          })}
        </div>
      </div>

      <div className="dk-settings-appearance__card">
        <SectionHeader
          title="Logo"
          description="Choose which Otix logo variant to display around the app."
        />

        <div className="dk-settings-appearance__logo-grid">
          {LOGO_VARIANTS.map((option) => {
            const isSelected = variant === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setVariant(option.value as LogoVariant)}
                className={cn(
                  'dk-settings-appearance__logo-card',
                  isSelected && 'dk-settings-appearance__logo-card--selected',
                )}
              >
                {/* Preview */}
                <div className={cn(
                  'dk-settings-appearance__logo-visual',
                  isSelected && 'dk-settings-appearance__logo-visual--selected',
                )}>
                  <Logo variant={option.value as LogoVariant} className="h-full" />
                </div>
                {/* Label */}
                <div className="dk-settings-appearance__logo-info">
                  <p className="dk-settings-appearance__logo-name">{option.label}</p>
                  <p className="dk-settings-appearance__logo-desc">{option.description}</p>
                </div>
                {/* Selected checkmark */}
                {isSelected && (
                  <div className="dk-settings-appearance__logo-badge">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="dk-settings-appearance__card">
        <SectionHeader
          title="Motion"
          description="Control animations and transitions across the app."
        />

        <div className="dk-settings-appearance__option-group">
          <div className="dk-settings-appearance__option-grid--motion">
            {MOTION_OPTIONS.map((option) => {
              const isActive = motionPreference === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMotionPreference(option.value)}
                  className={cn(
                    'dk-settings-appearance__option-btn',
                    isActive && 'dk-settings-appearance__option-btn--active',
                  )}
                >
                  <p className="dk-settings-appearance__option-label">{option.label}</p>
                  <p
                    className={cn(
                      'dk-settings-appearance__option-desc',
                      isActive && 'dk-settings-appearance__option-desc--active',
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

      <div className="dk-settings-appearance__card">
        <SectionHeader
          title="Home Background Quality"
          description="Control the animated shader quality on the homepage, or let Otix choose automatically."
        />

        <div className="dk-settings-appearance__option-group">
          <div className="dk-settings-appearance__option-grid--shader">
            {SHADER_QUALITY_OPTIONS.map((option) => {
              const isActive = shaderQuality === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setShaderQuality(option.value)}
                  className={cn(
                    'dk-settings-appearance__option-btn',
                    isActive && 'dk-settings-appearance__option-btn--active',
                  )}
                >
                  <p className="dk-settings-appearance__option-label">{option.label}</p>
                  <p
                    className={cn(
                      'dk-settings-appearance__option-desc',
                      isActive && 'dk-settings-appearance__option-desc--active',
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
