import { useMemo } from "react"
import { Helmet } from "react-helmet-async"
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { BookmarkIcon, Gamepad2Icon, LayoutDashboardIcon, ListIcon } from "lucide-react"
import { useAuth } from "@/lib/providers/auth"
import { TAB_LABELS } from "../library-queries"
import { getPlatformTabs } from "../platforms"
import { CORE_TABS } from "../constants"
import { TabBar } from "../molecules/tab-bar"

// Side-effect imports to register platform definitions
import "../platforms/spotify"
import "../platforms/steam"
import "../platforms/plex"

export function LibraryLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading: authLoading } = useAuth()

  const activeTab = location.pathname.replace("/library/", "").split("/")[0] || "overview"

  const visibleTabs = useMemo(() => {
    const tabs: Array<{ id: string; label: string; icon: React.ReactNode }> = []

    tabs.push({ id: "overview", label: TAB_LABELS.overview, icon: <LayoutDashboardIcon className="h-4 w-4" /> })
    tabs.push({ id: "games", label: TAB_LABELS.games, icon: <Gamepad2Icon className="h-4 w-4" /> })

    for (const t of CORE_TABS) {
      tabs.push({ id: t.id, label: TAB_LABELS[t.id], icon: t.icon })
    }

    if (!authLoading) {
      for (const pt of getPlatformTabs(user)) {
        tabs.push(pt)
      }
    }

    if (!authLoading && user?.steamId) {
      tabs.push({ id: "wishlist", label: TAB_LABELS.wishlist, icon: <BookmarkIcon className="h-4 w-4" /> })
    }

    tabs.push({ id: "lists", label: TAB_LABELS.lists, icon: <ListIcon className="h-4 w-4" /> })

    return tabs
  }, [user, authLoading])

  return (
    <div>
      <Helmet>
        <title>Library - Otix</title>
        <meta name="description" content="Your saved, liked, watched items, and lists on Otix." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="flex flex-col pl-5 pt-20">
        <h1 className="text-2xl font-bold text-foreground">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your saved, liked, watched items, and lists.
        </p>
      </div>

      <TabBar
        tabs={visibleTabs}
        activeTab={activeTab}
        onTabClick={(id) => navigate({ to: `/library/${id}`, replace: true })}
      />

      <Outlet />
    </div>
  )
}
