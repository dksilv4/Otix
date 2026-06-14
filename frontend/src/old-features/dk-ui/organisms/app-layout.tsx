import {useState, useCallback} from 'react'
import {Link, useRouter, useLocation} from '@tanstack/react-router'
import {Menu, ArrowLeft} from 'lucide-react'
import {DkButton} from '@dk-ui/atoms/button'
import {DkLogo} from '@dk-ui/atoms/logo'
import {NavigationProvider, MenuDropdown, useNavigation, NavSearch} from '@navigation'
import {usePageMeta} from '@/lib/page-context'
import {UserMenu} from '@auth'
import {NotificationBell} from '@/old-features/notifications/molecules/notification-bell'
import {XPToastContainer} from '@/old-features/dk-ui/atoms/xp-toast'
import {NowPlayingButton} from '@/old-features/spotify/now-playing-button'
import {NowPlayingView} from '@/old-features/spotify/now-playing-view'
import {TitleBar} from '@/old-features/title-bar/organisms/title-bar'

import {useDesktopPlatform} from '@/lib/desktop-platform'
import {cn} from '@/lib/utils'
import {useAuth} from '@/lib/auth'
import {useToast} from '@/old-features/dk-ui/molecules/toast'
import {useQueryClient} from '@tanstack/react-query'
import {API_BASE_URL} from '@/lib/config'
import {useSseStream} from '@/lib/use-sse-stream'
import type {SseEvent} from '@/lib/sse-client'
import type {ReactNode} from 'react'

const RECONNECT_DELAYS = [3000, 10000, 30000]

interface NotificationEvent extends SseEvent {
    id: string
    type: string
    title: string
    body: string | null
    is_read: boolean
    created_at: string
}

function notificationVariant(type: string): 'default' | 'success' | 'info' | 'warning' {
    if (type === 'friend_accepted') return 'success'
    if (type === 'friend_rejected' || type === 'friend_removed') return 'warning'
    if (type === 'friend_request' || type === 'list_invitation') return 'info'
    return 'default'
}

function useNotificationToasts() {
    const {isAuthenticated, user} = useAuth()
    const {toast} = useToast()
    const queryClient = useQueryClient()

    const handleMessage = useCallback((event: SseEvent) => {
        const n = event as NotificationEvent
        if (!n.id || !n.type) return

        queryClient.invalidateQueries({queryKey: ['notifications']})

        const prefs = user?.notificationPreferences ?? {}
        if (prefs[n.type] === false) return

        toast({
            title: n.title,
            description: n.body ?? undefined,
            variant: notificationVariant(n.type),
        })
    }, [queryClient, toast, user?.notificationPreferences])

    useSseStream({
        url: `${API_BASE_URL}/notifications/stream`,
        onMessage: handleMessage,
        enabled: isAuthenticated,
        reconnectDelays: RECONNECT_DELAYS,
    })
}

const PIN_KEY = 'otix_spotify_player_pinned'

function loadPinState(): boolean {
    try {
        return localStorage.getItem(PIN_KEY) === 'true'
    } catch {
        return false
    }
}

function MenuToggle() {
    const {toggle} = useNavigation()
    return (
        <DkButton
            variant="ghost"
            size="sm"
            onClick={toggle}
            className="w-8 h-8 rounded-full p-0 flex items-center justify-center"
            aria-label="Toggle menu"
        >
            <Menu className="h-5 w-5"/>
        </DkButton>
    )
}

function BackButton() {
    const router = useRouter()
    const canGoBack = typeof window !== "undefined" && window.history.length > 1

    if (!canGoBack) return null

    return (
        <DkButton
            variant="ghost"
            size="sm"
            onClick={() => router.history.back()}
            className="w-8 h-8 rounded-full p-0 flex items-center justify-center"
            aria-label="Go back"
        >
            <ArrowLeft className="h-5 w-5"/>
        </DkButton>
    )
}

function AppShell({children}: { children: ReactNode }) {
    const {navLogo} = usePageMeta()
    const location = useLocation()
    const isPinned = loadPinState()
    const {isDesktop} = useDesktopPlatform()

    const isHomePage = location.pathname === '/'
    const canGoBack = typeof window !== "undefined" && window.history.length > 1
    const showBackButton = !isHomePage && canGoBack
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)

    // On Electron, adjust floating pill positions to clear the title bar
    const titleBarOffset = isDesktop ? 'top-12' : 'top-4'

    const handleToggleSidebar = useCallback(() => {
        setIsSidebarOpen((prev) => !prev)
    }, [])

    const handleCloseSidebar = useCallback(() => {
        setIsSidebarOpen(false)
    }, [])

    useNotificationToasts()

    const floatingPillClasses = 'fixed z-[9999] flex items-center rounded-[2rem] gap-1 shadow-[var(--dk-shadow-glass)] backdrop-blur-[16px]'

    return (
        <div className="min-h-screen w-full max-w-[100vw] bg-[var(--background)]">
            <TitleBar/>

            {/* Left floating pill — hidden in game launcher (it has its own picker) */}
            {!location.pathname.startsWith('/game') && (
                <div
                    id={'menu-nav-left'}
                    className={cn(
                        floatingPillClasses,
                        'left-3 px-2 py-1.5',
                        titleBarOffset,
                        navLogo && 'pr-4',
                    )}
                    style={{
                        transition: 'all 300ms var(--dk-ease-out)',
                        background: 'oklch(from var(--dk-surface-raised) r g b / 0.25)',
                        backgroundImage: 'linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))',
                    }}
                    data-menu-trigger
                >
                    {showBackButton && <BackButton/>}
                    <MenuToggle/>
                    {navLogo ? (
                        <img src={navLogo} alt="" className="h-7 object-contain max-w-[120px]"/>
                    ) : (
                        <Link to="/" className="flex items-center pr-2">
                            <DkLogo/>
                        </Link>
                    )}
                </div>
            )}

            <MenuDropdown/>
            <div
                id={'menu-nav-right'}
                className={cn(
                    floatingPillClasses,
                    'right-4 px-2 py-1.5',
                    titleBarOffset,
                )}
                style={{
                    transition: 'all 300ms var(--dk-ease-out)',
                    background: 'oklch(from var(--dk-surface-raised) r g b / 0.25)',
                    backgroundImage: 'linear-gradient(to bottom right, var(--dk-surface-glass), var(--dk-surface-glass-hover))',
                }}
            >
                <NowPlayingButton
                    bare
                    isPinned={isPinned}
                    isSidebarOpen={isSidebarOpen}
                    onToggleSidebar={handleToggleSidebar}
                />
                <NavSearch/>
                <NotificationBell bare/>
                <UserMenu bare/>
            </div>

            <main className="flex w-full">
                {children}
            </main>

            <XPToastContainer/>
            <NowPlayingView open={isSidebarOpen} onClose={handleCloseSidebar}/>

        </div>
    )
}

function DkAppLayout({children}: { children: ReactNode }) {
    return (
        <NavigationProvider>
            <AppShell>{children}</AppShell>
        </NavigationProvider>
    )
}

export {DkAppLayout, DkAppLayout as AppLayout}
