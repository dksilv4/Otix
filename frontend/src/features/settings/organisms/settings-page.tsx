import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { ChevronDown, FlaskConical, Heart, User, Palette, Shield, Bell, Link2 } from 'lucide-react'
import { ExperimentsSection } from '@/features/experiments/organisms/experiments-section'
import { useTheme } from '@/lib/theme'
import { useAuth } from '@/features/auth/auth-provider'
import { DkAvatar } from '@/features/dk-ui/atoms/avatar'
import { cn } from '@/lib/utils'
import { PreferencesSection } from './settings-sections/preferences'
import { ProfileSection } from './settings-sections/profile'
import { AppearanceSection } from './settings-sections/appearance'
import { AccountSection } from './settings-sections/account'
import { IntegrationsSection } from './settings-sections/integrations'
import { NotificationsSection } from './settings-sections/notifications'

type Section = 'profile' | 'preferences' | 'appearance' | 'notifications' | 'account' | 'integrations' | 'experiments'

const NAV_ITEMS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'preferences', label: 'Preferences', icon: Heart },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'account', label: 'Account', icon: Shield },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'experiments', label: 'Experiments', icon: FlaskConical },
]

function isSettingsSection(value: unknown): value is Section {
  return typeof value === 'string' && NAV_ITEMS.some((item) => item.id === value)
}

export function SettingsPage() {
  const search = useSearch({ strict: false }) as { section?: string }
  const navigate = useNavigate()
  const [activeSection, setActiveSection] = useState<Section>(() =>
    isSettingsSection(search.section) ? search.section : 'profile',
  )
  const [mobileView, setMobileView] = useState<'menu' | 'section'>('menu')
  const { theme, setTheme } = useTheme()
  const { user, isAuthenticated } = useAuth()

  const handleSectionChange = (section: Section) => {
    setActiveSection(section)
    setMobileView('section')
    navigate({
      to: '/settings',
      search: section === 'profile' ? {} : ({ section } as never),
      replace: true,
    })
  }

  const handleBackToMenu = () => {
    setMobileView('menu')
  }

  return (
    <div className="mx-auto lg:max-w-5xl pb-16">
      <Helmet>
        <title>Settings - Otix</title>
      </Helmet>

      <div className="mt-6 md:flex md:gap-8">
        {/* Mobile menu page */}
        <div className={cn('md:hidden', mobileView === 'section' && 'hidden')}>
          <h1 className="mb-6 text-2xl font-bold tracking-[-0.02em]">Settings</h1>
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => handleSectionChange(item.id)}
                  className="flex w-full items-center gap-4 rounded-xl px-4 py-4 text-base font-medium transition-all active:scale-[0.98] hover:bg-[var(--dk-surface-glass)]"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span>{item.label}</span>
                  <ChevronDown className="h-4 w-4 ml-auto -rotate-90 text-muted-foreground/40" />
                </button>
              )
            })}
          </nav>

          {user && (
            <div className="mt-8 px-4 pt-6 border-t border-border/40">
              <div className="flex items-center gap-3">
                <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.username}
                    {user.isAdmin && (
                      <Shield className="h-3.5 w-3.5 inline-block ml-1 text-amber-400/80" />
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden md:block w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            <h1 className="px-3 mb-4 text-lg font-bold tracking-[-0.02em]">Settings</h1>
            <nav className="space-y-0.5">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon
                const isActive = activeSection === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSectionChange(item.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>

            {user && (
              <div className="mt-8 px-3 pt-6 border-t border-border/40">
                <div className="flex items-center gap-3">
                  <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.username}
                      {user.isAdmin && (
                        <Shield className="h-3.5 w-3.5 inline-block ml-1 text-amber-400/80" />
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Content area */}
        <main className={cn('flex-1 min-w-0', mobileView === 'menu' && 'hidden md:block')}>
          {/* Mobile back button */}
          <button
            onClick={handleBackToMenu}
            className="md:hidden flex items-center gap-2 mb-6 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown className="h-4 w-4 rotate-90" />
            Settings
          </button>
          {activeSection === 'profile' && (
            <ProfileSection user={user} isAuthenticated={isAuthenticated} />
          )}
          {activeSection === 'preferences' && (
            <PreferencesSection />
          )}
          {activeSection === 'appearance' && (
            <AppearanceSection theme={theme} onSetTheme={setTheme} />
          )}
          {activeSection === 'notifications' && (
            <NotificationsSection />
          )}
          {activeSection === 'account' && (
            <AccountSection user={user} isAuthenticated={isAuthenticated} />
          )}
          {activeSection === 'integrations' && (
            <IntegrationsSection />
          )}
          {activeSection === 'experiments' && (
            <ExperimentsSection />
          )}
        </main>
      </div>
    </div>
  )
}
