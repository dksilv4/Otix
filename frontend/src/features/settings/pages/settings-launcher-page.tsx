import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  Gamepad2,
  Palette,
  Monitor,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Lock,
} from 'lucide-react'
import { useAuth } from '@/lib/providers/auth'
import { useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsRow } from '../components/molecules/settings-row'
import { LauncherThemePreview } from '../components/molecules/launcher-theme-preview'
import { DkSwitch } from '@ui/atoms/switch'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import { LAUNCHER_THEMES, type LauncherThemeId } from '@/features/launcher/themes/theme-context'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import { SettingsEmulatorsCard } from '../components/molecules/settings-emulators-card'
import {
  type ThemeCategory,
  THEME_CATEGORIES,
  getThemeCategory,
} from '../utils/launcher'

export const SettingsLauncherPage = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { settings, update } = useLauncherSettings()
  useSettingsHashScroll()
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()

  const handleToggleSaveSessions = async (checked: boolean) => {
    try {
      await apiClient.patch('/auth/me', { saveGameSessions: checked })
      await refreshUser()
      await queryClient.invalidateQueries({ queryKey: ['user'] })
      await queryClient.invalidateQueries({ queryKey: ['user-game-sessions'] })
      toast({
        title: checked ? 'Session recording enabled' : 'Session recording paused',
        description: checked
          ? 'Gameplay sessions and telemetry will be recorded.'
          : 'Otix will not record new gameplay sessions to your profile.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Failed to update setting',
        description: 'An error occurred while saving your session preferences.',
        variant: 'error',
      })
    }
  }

  const handleToggleSessionPrivacy = async (checked: boolean) => {
    try {
      await apiClient.patch('/auth/me', { gameSessionsPrivate: checked })
      await refreshUser()
      await queryClient.invalidateQueries({ queryKey: ['user'] })
      await queryClient.invalidateQueries({ queryKey: ['user-game-sessions'] })
      toast({
        title: checked ? 'Sessions set to private' : 'Sessions set to public',
        description: checked
          ? 'New gameplay sessions are private to your profile.'
          : 'New gameplay sessions will be visible to other users on your profile.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Failed to update setting',
        description: 'An error occurred while saving your privacy preferences.',
        variant: 'error',
      })
    }
  }

  const [activeCategory, setActiveCategory] = useState<ThemeCategory>('all')

  const [activeTheme, setActiveTheme] = useState<LauncherThemeId>(() => {
    try {
      const stored = localStorage.getItem('otix:launcher-theme') as LauncherThemeId | null
      if (stored && LAUNCHER_THEMES.some((t) => t.id === stored)) return stored
    } catch {
      // ignore unavailable localStorage (private mode / SSR)
    }
    return 'modern'
  })

  useEffect(() => {
    const handleSync = () => {
      try {
        const stored = localStorage.getItem('otix:launcher-theme') as LauncherThemeId | null
        if (stored && LAUNCHER_THEMES.some((t) => t.id === stored)) {
          setActiveTheme(stored)
        }
      } catch {
        // ignore
      }
    }
    window.addEventListener('storage', handleSync)
    return () => window.removeEventListener('storage', handleSync)
  }, [])

  const selectedThemeMeta = useMemo(() => {
    return LAUNCHER_THEMES.find((t) => t.id === activeTheme) || LAUNCHER_THEMES[1]
  }, [activeTheme])

  const filteredThemes = useMemo(() => {
    if (activeCategory === 'all') return LAUNCHER_THEMES
    return LAUNCHER_THEMES.filter((t) => getThemeCategory(t.id) === activeCategory)
  }, [activeCategory])

  const handleSelectTheme = (themeId: LauncherThemeId) => {
    setActiveTheme(themeId)
    try {
      localStorage.setItem('otix:launcher-theme', themeId)
      window.dispatchEvent(new Event('storage'))
    } catch {
      // ignore
    }
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
        action={
          <DkButton type="button" onClick={() => navigate({ to: '/launcher' })}>
            <span>Launch App</span>
            <ArrowRight size={14} />
          </DkButton>
        }
      />

      <div id="launcher" className="space-y-5 scroll-mt-28">
        {/* ── Active Theme Spotlight Card ── */}
        <SettingsCard className="bg-[var(--dk-surface-raised)]">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="w-full md:w-72 lg:w-80 shrink-0">
              <div className="rounded-xl overflow-hidden shadow-xl transition-all duration-300">
                <LauncherThemePreview themeId={selectedThemeMeta.id} isSelected={true} />
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${selectedThemeMeta.accentColor} 20%, transparent)`,
                    color: selectedThemeMeta.accentColor,
                  }}
                >
                  <CheckCircle2 size={12} />
                  Active Default
                </span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[var(--dk-surface-field)] text-foreground">
                  {selectedThemeMeta.version}
                </span>
                <span className="text-xs text-muted-foreground font-medium">
                  {selectedThemeMeta.subtitle}
                </span>
              </div>

              <div>
                <h3 className="text-xl font-black text-foreground tracking-tight">
                  {selectedThemeMeta.name}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1 max-w-xl">
                  {selectedThemeMeta.description}
                </p>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <DkButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => navigate({ to: '/launcher' })}
                  className="gap-2"
                >
                  <span>Open Launcher</span>
                  <ArrowRight size={14} />
                </DkButton>
              </div>
            </div>
          </div>
        </SettingsCard>

        {/* ── Theme Selection Section ── */}
        <SettingsCard>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-bold text-foreground tracking-tight text-sm sm:text-base">
                  Themes & Layout Editions
                </h3>
              </div>
              <p className="text-muted-foreground mt-0.5 leading-relaxed text-xs">
                Select your default launcher interface. All 10 themes read the same game library,
                user profiles, and active play sessions.
              </p>
            </div>

            {/* Category filter pills */}
            <div className="flex items-center gap-1 bg-[var(--dk-surface-field)] p-1 rounded-xl shrink-0 self-start sm:self-center overflow-x-auto max-w-full">
              {THEME_CATEGORIES.map((cat) => {
                const count =
                  cat.id === 'all'
                    ? LAUNCHER_THEMES.length
                    : LAUNCHER_THEMES.filter((t) => getThemeCategory(t.id) === cat.id).length
                const isActive = activeCategory === cat.id
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      'px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer',
                      isActive
                        ? 'bg-[var(--dk-surface-overlay)] text-foreground font-semibold shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-hover)]',
                    )}
                  >
                    {cat.label} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
            {filteredThemes.map((theme) => {
              const isSelected = activeTheme === theme.id
              return (
                <div
                  key={theme.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectTheme(theme.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handleSelectTheme(theme.id)
                    }
                  }}
                  className={cn(
                    'group relative flex flex-col rounded-2xl p-3.5 transition-all duration-200 text-left cursor-pointer',
                    isSelected
                      ? 'bg-[var(--dk-surface-raised)] shadow-lg ring-1 ring-primary/20'
                      : 'bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-hover)]',
                  )}
                  style={
                    isSelected
                      ? {
                          boxShadow: `0 8px 24px -6px color-mix(in srgb, ${theme.accentColor} 25%, transparent)`,
                        }
                      : undefined
                  }
                >
                  {/* Miniature Preview */}
                  <div className="w-full aspect-[16/10] rounded-xl overflow-hidden mb-3 transition-all shadow-sm">
                    <LauncherThemePreview themeId={theme.id} isSelected={isSelected} />
                  </div>

                  {/* Header row */}
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-mono font-black uppercase px-1.5 py-0.5 rounded bg-[var(--dk-surface-field)] text-foreground shrink-0">
                        {theme.version}
                      </span>
                      <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                        {theme.name}
                      </h4>
                    </div>

                    {isSelected ? (
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-extrabold shrink-0"
                        style={{ color: theme.accentColor }}
                      >
                        <CheckCircle2 size={13} />
                        Active
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors shrink-0">
                        Select
                      </span>
                    )}
                  </div>

                  {/* Subtitle / category tag */}
                  <span
                    className="text-[11px] font-semibold tracking-wide uppercase"
                    style={{ color: isSelected ? theme.accentColor : 'var(--dk-muted-foreground)' }}
                  >
                    {theme.subtitle}
                  </span>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground font-normal leading-relaxed mt-1.5 line-clamp-2 flex-1">
                    {theme.description}
                  </p>

                  {/* Bottom status bar */}
                  <div className="w-full pt-2.5 mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">
                      {isSelected ? 'Default layout' : 'Click to activate'}
                    </span>
                    <div
                      className="h-1.5 rounded-full transition-all"
                      style={{
                        backgroundColor: isSelected ? theme.accentColor : 'var(--dk-surface-ghost)',
                        width: isSelected ? '24px' : '8px',
                      }}
                    />
                  </div>
                </div>
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

        {/* ── Game Sessions & Privacy ── */}
        <SettingsCard>
          <SectionHeader
            title="Game Sessions & Privacy"
            description="Manage automated gameplay session recording and profile session visibility."
          />

          <div className="space-y-2 mt-2">
            <SettingsRow
              icon={<Gamepad2 className="h-5 w-5" />}
              label="Record Game Sessions"
              description="Automatically track play duration, telemetry, and FPS performance when playing games"
              action={
                <DkSwitch
                  checked={user?.saveGameSessions ?? true}
                  onCheckedChange={handleToggleSaveSessions}
                />
              }
            />

            <SettingsRow
              icon={<Lock className="h-5 w-5" />}
              label="Default Session Privacy"
              description="Keep recorded game sessions private to your profile by default"
              action={
                <DkSwitch
                  checked={user?.gameSessionsPrivate ?? true}
                  onCheckedChange={handleToggleSessionPrivacy}
                />
              }
            />
          </div>
        </SettingsCard>

        {/* ── Emulators & Consoles ── */}
        <div id="emulators" className="scroll-mt-28">
          <SettingsEmulatorsCard />
        </div>

        {/* ── Overview Tip ── */}
        <SettingsCard>
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <div className="text-xs space-y-1">
              <p className="font-semibold text-foreground">Looking for Game Library & Download Settings?</p>
              <p className="text-muted-foreground leading-relaxed">
                Local folder scan paths, game matching, download directories, and worker nodes are managed under <span className="font-medium text-foreground">Settings &gt; Library</span> and <span className="font-medium text-foreground">Settings &gt; Nodes</span>.
                Linked accounts (Steam, Plex, *arr) are under <span className="font-medium text-foreground">Settings &gt; Connections</span>.
              </p>
            </div>
          </div>
        </SettingsCard>
      </div>
    </div>
  )
};
