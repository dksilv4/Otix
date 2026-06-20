import { useRef, useEffect, type ReactNode } from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

export interface TabBarProps {
  tabs: Array<{ id: string; label: string; icon: ReactNode }>
  activeTab: string
  onTabClick: (id: string) => void
}

export function TabBar({ tabs, activeTab, onTabClick }: TabBarProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Scroll active tab into view on change
  useEffect(() => {
    if (!containerRef.current) return
    const activeBtn = containerRef.current.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement | null
    activeBtn?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
  }, [activeTab])

  return (
    <div
      ref={containerRef}
      className="relative flex gap-1.5 overflow-x-auto w-full pb-1 mb-6 px-5 scrollbar-none snap-x snap-mandatory scroll-smooth"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-tab-id={tab.id}
          onClick={() => onTabClick(tab.id)}
          className={cn(
            "relative inline-flex shrink-0 snap-start items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-200",
            activeTab === tab.id
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="active-tab"
              className="absolute inset-0 rounded-xl bg-primary/12"
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
            />
          )}
          <span className="relative z-0 flex items-center gap-2">
            {tab.icon}
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  )
}
