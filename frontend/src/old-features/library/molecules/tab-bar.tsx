import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export interface TabBarProps {
  tabs: Array<{ id: string; label: string; icon: ReactNode }>
  activeTab: string
  onTabClick: (id: string) => void
}

export function TabBar({ tabs, activeTab, onTabClick }: TabBarProps) {
  return (
    <div className="px-4 py-4 flex gap-2 overflow-scroll w-[100vw] min-w-[100vw] pb-1 mb-6 pr-[85%]">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabClick(tab.id)}
          className={cn(`sticky z-[${tab.id}] left-0 bg-background inline-flex w-full min-w-[10rem] items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 whitespace-nowrap`,
            activeTab === tab.id
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass)]"
          )}
        >
          {tab.icon}
          {tab.label}
        </button>
      ))}
    </div>
  )
}
