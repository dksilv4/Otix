import { useState, useEffect } from 'react'
import { useShaderQuality, SHADER_QUALITY_OPTIONS } from '@/lib/shader-quality'
import { useMotionPreference, MOTION_OPTIONS } from '@/lib/motion-preference'
import type { ThemeSetting } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { Moon, Sun, Monitor, Plus } from 'lucide-react'
import { SectionHeader } from './profile'

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
    <div className="space-y-6">
      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader title="Theme" description="Choose how Otix looks on your device." />

        <div className="flex items-center justify-between rounded-xl bg-[var(--dk-surface-raised)] px-4 py-4 shadow-[var(--dk-shadow-xs)]">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {theme === 'dark' ? <Moon className="h-5 w-5" /> : theme === 'light' ? <Sun className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-sm font-medium">
                {theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'System'} mode
              </p>
              <p className="text-xs text-muted-foreground">
                {theme === 'dark' ? 'Easier on the eyes at night' : theme === 'light' ? 'Bright and crisp for daytime' : 'Follows your device settings'}
              </p>
            </div>
          </div>
          <div className="flex rounded-lg bg-[var(--dk-surface-base)] p-1 gap-0.5">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSetTheme(t)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  theme === t
                    ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-[var(--dk-shadow-xs)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t === 'system' ? 'System' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader title="Accent" description="Pick a color accent for the interface." />

        <div className="flex flex-wrap gap-3">
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAccent(a.primary)}
              className="relative h-7 w-7 rounded-full transition-transform hover:scale-110 active:scale-95"
              style={{ backgroundColor: a.primary }}
            >
              {isActive(a.primary) && (
                <span className="absolute inset-0 rounded-full ring-2 ring-foreground/20 ring-offset-2 ring-offset-[var(--dk-surface-base)]" />
              )}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 pt-4 border-t border-border/30">
          {Array.from({ length: 16 }).map((_, i) => {
            const color = customAccents[i] || ''
            const hasColor = color.length > 0
            const active = hasColor && isActive(color)
            return (
              <label
                key={i}
                className={cn(
                  'relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95',
                  hasColor ? '' : 'bg-[var(--dk-surface-raised)]',
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
                  <span className="absolute inset-0 rounded-full ring-2 ring-foreground/20 ring-offset-2 ring-offset-[var(--dk-surface-base)] pointer-events-none" />
                )}
                <input
                  type="color"
                  value={color || '#000000'}
                  onChange={(e) => setCustomSlot(i, e.target.value)}
                  className="absolute -left-1.5 top-0 bottom-0 right-0 opacity-0"
                />
              </label>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader
          title="Motion"
          description="Control animations and transitions across the app."
        />

        <div className="rounded-xl bg-[var(--dk-surface-raised)] p-2 shadow-[var(--dk-shadow-xs)]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {MOTION_OPTIONS.map((option) => {
              const isActive = motionPreference === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMotionPreference(option.value)}
                  className={cn(
                    'rounded-xl px-3 py-3 text-left transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
                      : 'bg-[var(--dk-surface-overlay)] text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
                  )}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      isActive ? 'text-primary-foreground/80' : 'text-muted-foreground',
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

      <div className="rounded-2xl bg-[var(--dk-surface-base)] p-6 shadow-[var(--dk-shadow-md)]">
        <SectionHeader
          title="Home Background Quality"
          description="Control the animated shader quality on the homepage, or let Otix choose automatically."
        />

        <div className="rounded-xl bg-[var(--dk-surface-raised)] p-2 shadow-[var(--dk-shadow-xs)]">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {SHADER_QUALITY_OPTIONS.map((option) => {
              const isActive = shaderQuality === option.value
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setShaderQuality(option.value)}
                  className={cn(
                    'rounded-xl px-3 py-3 text-left transition-all',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]'
                      : 'bg-[var(--dk-surface-overlay)] text-foreground hover:bg-[var(--dk-surface-glass-hover)]',
                  )}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p
                    className={cn(
                      'mt-1 text-xs',
                      isActive ? 'text-primary-foreground/80' : 'text-muted-foreground',
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
