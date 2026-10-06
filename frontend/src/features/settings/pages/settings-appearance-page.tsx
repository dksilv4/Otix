import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { useTheme } from '@/lib/providers/theme'
import { useShaderQuality, SHADER_QUALITY_OPTIONS } from '@/lib/providers/shader-quality'
import { useMotionPreference, MOTION_OPTIONS } from '@/lib/providers/motion-preference'
import { cn } from '@/lib/utils'
import { Moon, Sun, Monitor, Plus, Palette } from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import { SettingsGeneralPage } from './settings-general-page'
import {
  ACCENTS,
  CUSTOM_ACCENTS_KEY,
  getCustomAccents,
  getInitialAccent,
  applyAccentColor,
} from '../utils/appearance'

export const SettingsAppearancePage = () => {
  const { theme, setTheme } = useTheme()
  const { shaderQuality, setShaderQuality } = useShaderQuality()
  const { motionPreference, setMotionPreference } = useMotionPreference()
  const [accent, setAccent] = useState<string>(getInitialAccent)
  const [customAccents, setCustomAccents] = useState<string[]>(getCustomAccents)
  const location = useLocation()
  const navigate = useNavigate()
  useSettingsHashScroll()

  useEffect(() => {
    if (location.hash === '#launcher' || location.hash === 'launcher') {
      navigate({ to: '/settings/launcher', replace: true })
    } else if (location.hash === '#desktop' || location.hash === 'desktop') {
      navigate({ to: '/settings/nodes', replace: true })
    }
  }, [location.hash, navigate])

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
    <div id="settings-appearance-section" className="space-y-8">
      <SectionHeader
        variant="page"
        icon={Palette}
        title="Appearance"
        description="Theme, motion, app defaults, and client cache."
      />

      <div id="appearance" className="space-y-5 scroll-mt-28">
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
                      isActiveOpt ? 'text-primary-foreground/80' : 'text-muted-foreground',
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
                      isActiveOpt ? 'text-primary-foreground/80' : 'text-muted-foreground',
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
      </div>

      <SettingsGeneralPage />
    </div>
  )
};
