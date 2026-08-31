import { useMemo, useState, useEffect, useCallback } from "react"
import { Helmet } from "react-helmet-async"
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookmarkIcon, Gamepad2Icon, LayoutDashboardIcon, ListIcon,
  SlidersHorizontal, Check,
} from "lucide-react"
import { useAuth } from "@/lib/providers/auth"
import { TAB_LABELS } from "@/old-features/library/library-queries"
import { getPlatformTabs } from "@/old-features/library/platforms"
import { CORE_TABS } from "@/old-features/library/constants"
import { TabBar } from "@/old-features/library/molecules/tab-bar"
import { useSlotData, SlotRenderer } from "@/features/_config/slots"
import { getPluginAPI, getPluginIcon } from "@/features/plugins/api"
import type { SlotContribution, PluginInfo } from "@/features/plugins/types/plugins"
import { OfflineNotice } from "@/lib/offline-notice"
import { cn } from "@/lib/utils"

// Side-effect imports to register platform definitions
import "@/old-features/library/platforms/steam"
import "@/old-features/library/platforms/plex"
import "@/old-features/library/platforms/youtube"

const VISIBILITY_KEY = "otix:library-tabs:visible"

type LibTab = {
  id: string
  label: string
  icon: React.ReactNode
  kind: "media" | "plugin" | "all"
  contribution?: SlotContribution
}

function readVisibility(): string[] | null {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed.filter((x): x is string => typeof x === "string")) : null
  } catch {
    return null
  }
}

export function LibraryLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading: authLoading } = useAuth()

  // Plugin/all tabs have no URL, so they live in local state; media tabs navigate.
  const [customTab, setCustomTab] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [visibility, setVisibility] = useState<string[] | null>(readVisibility)
  const [pluginInfos, setPluginInfos] = useState<PluginInfo[]>([])
  const { data: slotData } = useSlotData("library")
  const api = getPluginAPI()

  const urlTab = location.pathname.replace("/library/", "").split("/")[0] || "overview"
  const activeTab = customTab ?? urlTab

  useEffect(() => {
    if (!api?.list) return
    let cancelled = false
    api.list()
      .then((list) => { if (!cancelled) setPluginInfos(list) })
      .catch(() => { if (!cancelled) setPluginInfos([]) })
    return () => { cancelled = true }
  }, [api])

  const handleAction = useCallback((pluginId: string, actionKey: string, payload: unknown) => {
    return api?.callData(pluginId, "handleAction", actionKey, payload)
  }, [api])

  const mediaTabs = useMemo(() => {
    const tabs: LibTab[] = []
    tabs.push({ id: "overview", label: TAB_LABELS.overview, icon: <LayoutDashboardIcon className="h-4 w-4" />, kind: "media" })
    tabs.push({ id: "games", label: TAB_LABELS.games, icon: <Gamepad2Icon className="h-4 w-4" />, kind: "media" })

    for (const t of CORE_TABS) {
      tabs.push({ id: t.id, label: TAB_LABELS[t.id], icon: t.icon, kind: "media" })
    }

    if (!authLoading) {
      for (const pt of getPlatformTabs(user)) {
        tabs.push({ id: pt.id, label: pt.label, icon: pt.icon, kind: "media" })
      }
    }

    if (!authLoading && user?.steamId) {
      tabs.push({ id: "wishlist", label: TAB_LABELS.wishlist, icon: <BookmarkIcon className="h-4 w-4" />, kind: "media" })
    }

    tabs.push({ id: "lists", label: TAB_LABELS.lists, icon: <ListIcon className="h-4 w-4" />, kind: "media" })

    return tabs
  }, [user, authLoading])

  const pluginTabs = useMemo<LibTab[]>(() => {
    const contributions = slotData?.["library:tabs"] ?? []
    return contributions.map((contribution) => {
      const info = pluginInfos.find((p) => p.id === contribution.pluginId)
      const Icon = getPluginIcon(info?.manifest.icon)
      return {
        id: `plugin:${contribution.pluginId}`,
        label: contribution.label,
        icon: <Icon className="h-4 w-4" />,
        kind: "plugin" as const,
        contribution,
      }
    })
  }, [slotData, pluginInfos])

  const allTabs = useMemo(() => [...mediaTabs, ...pluginTabs], [mediaTabs, pluginTabs])

  const visibleTabs = useMemo<LibTab[]>(() => {
    return allTabs.filter((t) => !visibility || visibility.includes(t.id))
  }, [allTabs, visibility])

  const setTabVisible = useCallback((id: string, visible: boolean) => {
    setVisibility((prev) => {
      const base = prev ?? allTabs.map((t) => t.id)
      const next = new Set(base)
      if (visible) next.add(id)
      else next.delete(id)
      const arr = allTabs.map((t) => t.id).filter((tabId) => next.has(tabId))
      try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(arr)) } catch { /* ignore */ }
      return arr
    })
  }, [allTabs])

  const handleTabClick = useCallback((id: string) => {
    // Plugin tabs have no URL route
    if (id.startsWith("plugin:")) {
      setCustomTab(id)
      return
    }
    setCustomTab(null)
    navigate({ to: `/library/${id}`, replace: true })
  }, [navigate])

  const activePluginTab = activeTab.startsWith("plugin:")
    ? pluginTabs.find((t) => t.id === activeTab)
    : undefined

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-12">
      <Helmet>
        <title>Library - Otix</title>
        <meta name="description" content="Your saved, liked, watched items, and lists on Otix." />
        <meta name="robots" content="noindex" />
      </Helmet>
      <div className="flex flex-col mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Library</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your saved, liked, watched items, and lists.
        </p>
        <OfflineNotice className="mt-3 self-start" />
      </div>

      <div className="flex items-start gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <TabBar tabs={visibleTabs} activeTab={activeTab} onTabClick={handleTabClick} />
        </div>
        <div className="relative shrink-0 pt-0.5">
          <button
            onClick={() => setManageOpen((open) => !open)}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
              manageOpen ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground",
            )}
            aria-label="Manage tabs"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
          {manageOpen && (
            <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-xl border border-border bg-background p-2 shadow-2xl">
              <p className="px-2 pb-1.5 pt-1 text-xs font-medium text-muted-foreground">Show tabs</p>
              {allTabs.map((tab) => {
                const checked = !visibility || visibility.includes(tab.id)
                return (
                  <button
                    key={tab.id}
                    onClick={() => setTabVisible(tab.id, !checked)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-muted"
                  >
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", checked ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    {tab.icon}
                    {tab.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: "easeInOut" }}
        >
          {activePluginTab ? (
            <SlotRenderer contributions={[activePluginTab.contribution!]} onAction={handleAction} />
          ) : (
            <Outlet />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
