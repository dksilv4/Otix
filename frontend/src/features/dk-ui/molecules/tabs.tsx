import { createContext, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import './tabs.scss'

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

function DkTabs({ defaultValue, value: controlledValue, onValueChange, children, className }: DkTabsProps) {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const value = controlledValue ?? uncontrolledValue
  const onChange = onValueChange ?? setUncontrolledValue

  return (
    <TabsContext.Provider value={{ value, onChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  )
}

function DkTabList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn('dk-tab-list', className)}
    >
      {children}
    </div>
  )
}

function DkTab({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('DkTab must be inside DkTabs')
  const isActive = ctx.value === value

  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={() => ctx.onChange(value)}
      className={cn(
        'dk-tab',
        isActive ? 'dk-tab--active' : 'dk-tab--inactive',
        className,
      )}
    >
      {children}
    </button>
  )
}

function DkTabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error('DkTabPanel must be inside DkTabs')
  if (ctx.value !== value) return null

  return (
    <div role="tabpanel" className={cn('dk-tab-panel', className)}>
      {children}
    </div>
  )
}

export { DkTabs, DkTabList, DkTab, DkTabPanel }
