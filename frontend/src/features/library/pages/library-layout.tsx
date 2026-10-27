import { useMemo, useState, useEffect, useCallback } from "react"
import { Helmet } from "react-helmet-async"
import { Outlet, useLocation, useNavigate, useRouterState } from "@tanstack/react-router"
import { motion, AnimatePresence } from "framer-motion"
import {
  BookmarkIcon, Gamepad2Icon, LayoutDashboardIcon, ListIcon,
  SlidersHorizontal,
} from "lucide-react"
import { useAuth } from "@/lib/providers/auth"
import { useModal } from "@/lib/modals"
import { TAB_LABELS } from "@library/library-queries"
import { getPlatformTabs } from "@library/platforms"
import { CORE_TABS } from "@library/constants"
import { TabBar } from "@library/molecules/tab-bar"
import { LibraryTabSettingsModal } from "@library/molecules/library-tab-settings-modal"
import { useSlotData, SlotRenderer } from "@/features/_config/slots"
import { getPluginAPI, getPluginIcon } from "@/features/plugins/api"
import type { SlotContribution, PluginInfo } from "@/features/plugins/types/plugins"
import { OfflineNotice } from "@/lib/offline-notice"

// Side-effect imports to register platform definitions
import "@library/platforms/steam"
import "@library/platforms/plex"
import "@library/platforms/youtube"
import { readVisibility, readTabOrder, sortTabsByOrder } from "../utils"

type LibTab = {
  id: string
  label: string
  icon: React.ReactNode
  kind: "media" | "plugin" | "all"
  contribution?: SlotContribution
}

export const LibraryLayout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isLoading: authLoading } = useAuth()

  // Plugin/all tabs have no URL, so they live in local state; media tabs navigate.
  const { openModal } = useModal()
  const isPending = useRouterState({ select: (s) => s.status === 'pending' })
  const [customTab, setCustomTab] = useState<string | null>(null)
  const [tabOrder, setTabOrder] = useState<string[] | null>(readTabOrder)
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

  const handleAction = useCallback(async (pluginId: string, actionKey: string, payload: unknown): Promise<void> => {
    await api?.callData(pluginId, "handleAction", actionKey, payload)
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

  const orderedTabs = useMemo(() => {
    return sortTabsByOrder(allTabs, tabOrder)
  }, [allTabs, tabOrder])

  const visibleTabs = useMemo<LibTab[]>(() => {
    return orderedTabs.filter((t) => !visibility || visibility.includes(t.id))
  }, [orderedTabs, visibility])

  const handleOpenSettingsModal = useCallback(() => {
    let closeFn: () => void = () => {}
    closeFn = openModal(
      <LibraryTabSettingsModal
        allTabs={allTabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon }))}
        currentOrder={tabOrder ?? allTabs.map((t) => t.id)}
        currentVisibility={visibility ?? allTabs.map((t) => t.id)}
        onSave={(newOrder, newVisibility) => {
          setTabOrder(newOrder)
          setVisibility(newVisibility)
        }}
        onClose={() => closeFn()}
      />,
    )
  }, [allTabs, tabOrder, visibility, openModal])

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
          <TabBar
            tabs={visibleTabs}
            activeTab={activeTab}
            onTabClick={handleTabClick}
            isLoading={isPending}
          />
        </div>
        <div className="relative shrink-0 pt-0.5">
          <button
            type="button"
            onClick={handleOpenSettingsModal}
            className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors duration-200"
            aria-label="Customize tabs"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
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
};
