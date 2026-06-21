// TODO: Review this file
import { useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Helmet } from 'react-helmet-async'
import { ChevronDown, Heart, User, Palette, Shield, Bell, Link2, Download, FolderKanban, ScanSearch, Monitor, Brain } from 'lucide-react'
import { useTheme } from '@/lib/providers/theme'
import { useAuth } from '@/lib/providers/auth'
import { DkAvatar } from '@/old-features/dk-ui/atoms/avatar'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'
import { PreferencesSection } from '../organisms/settings-sections/preferences'
import { ProfileSection } from '../organisms/settings-sections/profile'
import { AppearanceSection } from '../organisms/settings-sections/appearance'
import { AccountSection } from '../organisms/settings-sections/account'
import { IntegrationsSection } from '../organisms/settings-sections/integrations'
import { NotificationsSection } from '../organisms/settings-sections/notifications'
import { DownloadsSection } from '../organisms/settings-sections/downloads-section'
import { OrganizerSection } from '../organisms/settings-sections/organizer-section'
import { ScannersSection } from '../organisms/settings-sections/scanners-section'
import { DesktopSection } from '../organisms/settings-sections/desktop'
import { IntelligenceSection } from '../organisms/settings-sections/intelligence'

type Section = 'profile' | 'preferences' | 'appearance' | 'notifications' | 'account' | 'integrations' | 'experiments' | 'downloads' | 'organizer' | 'scanners' | 'desktop' | 'intelligence'

const NAV_ITEMS: { id: Section; label: string; icon: typeof User }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'account', label: 'Security', icon: Shield },
  { id: 'preferences', label: 'Preferences', icon: Heart },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'integrations', label: 'Integrations', icon: Link2 },
  { id: 'intelligence', label: 'Intelligence', icon: Brain },
  { id: 'scanners', label: 'Scanners', icon: ScanSearch },
  { id: 'downloads', label: 'Downloads', icon: Download },
  { id: 'organizer', label: 'Organizer', icon: FolderKanban },
  { id: 'desktop', label: 'Window', icon: Monitor },
]

function isSettingsSection(value: unknown): value is Section {
  return typeof value === 'string' && NAV_ITEMS.some((item) => item.id === value)
}

export function SettingsPage() {
  const search = useSearch({ strict: false }) as { section?: string }
  const navigate = useNavigate()
  const desktop = isDesktop()
  const desktopSections = new Set(['downloads', 'organizer', 'scanners', 'desktop', 'intelligence'])
  const filteredNav = NAV_ITEMS.filter(i => !desktopSections.has(i.id) || desktop)
  const [activeSection, setActiveSection] = useState<Section>(() =>
    isSettingsSection(search.section) && (!desktopSections.has(search.section) || desktop) ? search.section : 'profile',
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
    <div className="dk-settings-page">
      <Helmet>
        <title>Settings - Otix</title>
      </Helmet>

      <div className="dk-settings-page__layout">
        {/* Mobile menu page */}
        <div className={cn('dk-settings-page__mobile-menu', mobileView === 'section' && 'dk-settings-page__mobile-menu--hidden')}>
          <h1 className="dk-settings-page__mobile-title">Settings</h1>
          <nav className="dk-settings-page__mobile-nav">
            {filteredNav.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => handleSectionChange(item.id)}
                  className="dk-settings-page__nav-btn"
                >
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <span>{item.label}</span>
                  <ChevronDown className="h-4 w-4 ml-auto -rotate-90 text-muted-foreground/40" />
                </button>
              )
            })}
          </nav>

          {user && (
            <div className="dk-settings-page__mobile-user">
              <div className="dk-settings-page__user-card">
                <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                <div className="dk-settings-page__user-details">
                  <p className="dk-settings-page__user-name">
                    {user.username}
                    {user.isAdmin && (
                      <Shield className="h-3.5 w-3.5 inline-block ml-1 text-amber-400/80" />
                    )}
                  </p>
                  <p className="dk-settings-page__user-email">{user.email}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop sidebar */}
        <aside className="dk-settings-page__sidebar">
          <div className="dk-settings-page__sidebar-inner">
            <h1 className="dk-settings-page__sidebar-title">Settings</h1>
            <nav className="dk-settings-page__sidebar-nav">
              {filteredNav.map((item) => {
                const Icon = item.icon
                const isActive = activeSection === item.id
                return (
                  <button
                    key={item.id}
                    onClick={() => handleSectionChange(item.id)}
                    className={cn(
                      'dk-settings-page__sidebar-btn',
                      isActive ? 'dk-settings-page__sidebar-btn--active' : 'dk-settings-page__sidebar-btn--inactive',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>

            {user && (
              <div className="dk-settings-page__sidebar-user">
                <div className="dk-settings-page__user-card">
                  <DkAvatar src={user.avatarUrl} name={user.username} size="sm" />
                  <div className="dk-settings-page__user-details">
                    <p className="dk-settings-page__user-name">
                      {user.username}
                      {user.isAdmin && (
                        <Shield className="h-3.5 w-3.5 inline-block ml-1 text-amber-400/80" />
                      )}
                    </p>
                    <p className="dk-settings-page__user-email">{user.email}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Content area */}
        <main className={cn('dk-settings-page__content', mobileView === 'menu' && 'dk-settings-page__content--menu-shown')}>
          {/* Mobile back button */}
          <button
            onClick={handleBackToMenu}
            className="dk-settings-page__back-btn"
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
          {activeSection === 'downloads' && (
            <DownloadsSection />
          )}
          {activeSection === 'organizer' && (
            <OrganizerSection />
          )}
          {activeSection === 'scanners' && (
            <ScannersSection />
          )}
          {activeSection === 'intelligence' && (
            <IntelligenceSection />
          )}
          {activeSection === 'desktop' && (
            <DesktopSection />
          )}
        </main>
      </div>
    </div>
  )
}
