import { createContext, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabsContextValue {
  value: string
  onChange: (value: string) => void
}
const TabsContext = createContext<TabsContextValue | null>(null)

interface DkTabsProps {
  defaultValue: string
  value?: string
  onValueChange?: (value: string) => void
  children: ReactNode
  className?: string
}

const DkTabs = ({ defaultValue, value: controlledValue, onValueChange, children, className }: DkTabsProps) => {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const value = controlledValue ?? uncontrolledValue
  const onChange = onValueChange ?? setUncontrolledValue

  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
};

const DkTabList = ({ children, className }: { children: ReactNode; className?: string }) => {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex gap-1 rounded-2xl p-1 bg-[color-mix(in_srgb,var(--muted)_50%,transparent)]',
        className,
      )}
    >
      {children}
    </div>
  )
};

const DkTab = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('DkTab must be inside DkTabs')
  const isActive = ctx.value === value

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx.onChange(value)}
      className={cn(
        'rounded-xl px-4 py-2 text-sm font-medium',
        'transition-all duration-[var(--dk-duration-fast)] ease-[var(--dk-ease-out)]',
        isActive
          ? 'bg-[var(--dk-surface-base)] text-[var(--foreground)] shadow-[var(--dk-shadow-sm)]'
          : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--dk-surface-ghost-hover)]',
        className,
      )}
    >
      {children}
    </button>
  )
};

const DkTabPanel = ({ value, children, className }: { value: string; children: ReactNode; className?: string }) => {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('DkTabPanel must be inside DkTabs')
  if (ctx.value !== value) return null

  return (
    <div role="tabpanel" className={cn('pt-4', className)}>
      {children}
    </div>
  )
};

export { DkTabs, DkTabList, DkTab, DkTabPanel }
