import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Gamepad2,
  Palette,
  Monitor,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsRow } from '../components/molecules/settings-row'
import { DkSwitch } from '@ui/atoms/switch'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import { LAUNCHER_THEMES, type LauncherThemeId } from '@/features/launcher/themes/theme-context'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'

export function SettingsLauncherPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { settings, update } = useLauncherSettings()
  useSettingsHashScroll()

  const [activeTheme, setActiveTheme] = useState<LauncherThemeId>(() => {
    try {
      const stored = localStorage.getItem('otix:launcher-theme') as LauncherThemeId | null
      if (stored && LAUNCHER_THEMES.some((t) => t.id === stored)) return stored
    } catch {}
    return 'modern'
  })

  const handleSelectTheme = (themeId: LauncherThemeId) => {
    setActiveTheme(themeId)
    localStorage.setItem('otix:launcher-theme', themeId)
    window.dispatchEvent(new Event('storage'))
    toast({
      title: 'Launcher Theme Updated',
      description: `Default layout set to ${LAUNCHER_THEMES.find((t) => t.id === themeId)?.name}.`,
      variant: 'success',
    })
  }

  return (
    <div id="settings-launcher-section" className="space-y-8">
      <SectionHeader
        variant="page"
        icon={Gamepad2}
        title="Launcher"
        description="Theme layouts, animations, transitions, and console experience."
      />

      <div id="launcher" className="space-y-5 scroll-mt-28">
      {/* ── Top Hero Banner ── */}
      <SettingsCard className="bg-gradient-to-r from-primary/15 via-primary/5 to-transparent">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-black font-black shadow-lg shadow-primary/20">
              <Gamepad2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Otix Game Launcher</h3>
              <p className="text-xs text-white/60 mt-0.5">
                Experience your games across 10 unique layouts and console editions.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <DkButton type="button" onClick={() => navigate({ to: '/launcher' })}>
              <span>Launch App</span>
              <ArrowRight size={14} />
            </DkButton>
          </div>
        </div>
      </SettingsCard>

      {/* ── Theme Selection Section ── */}
      <SettingsCard>
        <SectionHeader
          title="Launcher Theme & Layout Edition"
          description="Select your default launcher interface. All 10 themes read the same game library, user profiles, and active play sessions."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {LAUNCHER_THEMES.map((theme) => {
            const isSelected = activeTheme === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleSelectTheme(theme.id)}
                className={cn(
                  'flex flex-col items-start p-3.5 rounded-xl transition-all text-left cursor-pointer group relative overflow-hidden',
                  isSelected
                    ? 'bg-primary/15 shadow-[0_0_20px_rgba(var(--primary),0.25)] ring-2'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 border border-transparent',
                )}
                style={isSelected ? { borderColor: theme.accentColor } : undefined}
              >
                {isSelected && (
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: theme.accentColor }}
                  />
                )}
                <div className="flex items-center justify-between w-full mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-white/10 text-white/80">
                      {theme.version}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      BETA
                    </span>
                  </div>
                  {isSelected ? (
                    <span className="flex items-center gap-1 text-[10px] font-extrabold" style={{ color: theme.accentColor }}>
                      <CheckCircle2 size={12} />
                      Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-white/40 group-hover:text-white/80 transition-colors">
                      Select
                    </span>
                  )}
                </div>

                <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                  {theme.name}
                </span>
                <span
                  className="text-[10px] font-semibold tracking-wide uppercase mt-0.5"
                  style={{ color: isSelected ? theme.accentColor : undefined }}
                >
                  {theme.subtitle}
                </span>
                <p className="text-[11px] text-white/50 font-normal leading-relaxed mt-1.5 line-clamp-3">
                  {theme.description}
                </p>

                <div className="w-full pt-2.5 mt-2.5 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-white/40">
                    {isSelected ? 'Default layout' : 'Click to select'}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-bold flex items-center gap-1" style={{ color: theme.accentColor }}>
                      <CheckCircle2 size={11} />
                      Selected
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </SettingsCard>

      {/* ── Playback & Display Options ── */}
      <SettingsCard>
        <SectionHeader
          title="Display & Behavior"
          description="Fine-tune animations, backdrop transitions, and launcher start behaviors."
        />

        <div className="space-y-2">
          <SettingsRow
            icon={<Palette className="h-5 w-5" />}
            label="Dynamic Background Transitions"
            description="Dynamically shift wallpaper artwork and cinematic gradients based on hovered games"
            action={
              <DkSwitch
                checked={settings.backgroundTransitions}
                onCheckedChange={(checked) => update('backgroundTransitions', checked)}
              />
            }
          />

          <SettingsRow
            icon={<Monitor className="h-5 w-5" />}
            label="Landing View Format"
            description="Default tab or landing format when entering the launcher"
            action={
              <DkDropdown
                options={[
                  { value: 'library', label: 'Library (Full Catalog)' },
                  { value: 'slide-picker', label: 'Spotlight Carousel' },
                ]}
                value={settings.defaultPage}
                onChange={(v) => update('defaultPage', v as typeof settings.defaultPage)}
                className="w-48"
              />
            }
          />
        </div>
      </SettingsCard>

      {/* ── Overview Tip ── */}
      <SettingsCard>
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="text-xs space-y-1">
            <p className="font-semibold text-white">Looking for Game Library & Download Settings?</p>
            <p className="text-white/60 leading-relaxed">
              Local folder scan paths and game matching are managed under <span className="font-medium text-white">Settings &gt; Library</span>.
              Download directories and game servers are under <span className="font-medium text-white">Settings &gt; Downloads</span>.
              Linked accounts (Steam, Plex, *arr) are under <span className="font-medium text-white">Settings &gt; Connections</span>.
            </p>
          </div>
        </div>
      </SettingsCard>
      </div>
    </div>
  )
}
