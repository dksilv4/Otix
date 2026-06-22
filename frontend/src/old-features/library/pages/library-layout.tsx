import { useMemo } from "react"
import { Helmet } from "react-helmet-async"
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import { BookmarkIcon, Gamepad2Icon, LayoutDashboardIcon, ListIcon } from "lucide-react"
import { useAuth } from "@/lib/providers/auth"
import { TAB_LABELS } from "@/old-features/library/library-queries"
import { getPlatformTabs } from "@/old-features/library/platforms"
import { CORE_TABS } from "@/old-features/library/constants"
import { TabBar } from "@/old-features/library/molecules/tab-bar"

// Side-effect imports to register platform definitions
import "@/old-features/library/platforms/spotify"
import "@/old-features/library/platforms/steam"
import "@/old-features/library/platforms/plex"
import "@/old-features/library/platforms/youtube"

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
      <div className="flex flex-col pl-5 pt-20 sm:pt-28">
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

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
