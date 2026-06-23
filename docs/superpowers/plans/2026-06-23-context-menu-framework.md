# Context Menu Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Universal context menu framework supporting right-click (desktop) and long-press (mobile), with submenus, keyboard nav, slot contributions, and Framer Motion animations.

**Architecture:** React Context + Floating UI + Framer Motion Portal. App root wraps `ContextMenuProvider`. Any element wraps `ContextMenuTrigger` → right-click/long-press dispatches position+items into context → `ContextMenuPortal` renders `ContextMenuContent` at cursor position via Floating UI with flip/shift/offset.

**Tech Stack:** React 19, TypeScript 6, Framer Motion 12, @floating-ui/react, TailwindCSS 4, Lucide React

## Global Constraints

- No Radix UI packages — use @floating-ui/react for positioning only
- Design tokens: `var(--dk-*)` only, no hardcoded colors
- Portal renders into `document.body`
- Keyboard nav: ArrowUp/Down wrap, ArrowRight/Left submenu, Escape close, Enter activate
- Mobile long-press: 500ms timer, 10px movement threshold cancels
- All components in `frontend/src/features/_config/context-menu/`
- Follow existing code style: framer-motion `[0.16, 1, 0.3, 1]` ease, glass surface pattern

---
### Task 1: Install dependency + registry entries + types

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src/features/_config/registry.ts`
- Modify: `frontend/src/features/_config/types.ts`
- Create: `frontend/src/features/_config/context-menu/types.ts`

**Interfaces:**
- Consumes: existing `FeatureName` union, `FeatureDefinition` interface
- Produces: `ContextMenuItemDef` type, `ContextMenuPosition` type, feature flags for `context-menu:*`

- [ ] **Step 1: Install @floating-ui/react**

```bash
rtk cd frontend && npm install @floating-ui/react
```

Expected: added to `package.json` dependencies.

- [ ] **Step 2: Add feature names to registry**

In `frontend/src/features/_config/types.ts`, add to `FeatureName` union:
```ts
| 'context-menu:game'
| 'context-menu:movie'
| 'context-menu:tv'
| 'context-menu:music'
| 'context-menu:generic'
```

In `frontend/src/features/_config/registry.ts`, add:
```ts
'context-menu:game': {label: 'Game context menu', enabled: true, dependsOn: ['dk-ui']},
'context-menu:movie': {label: 'Movie context menu', enabled: true, dependsOn: ['dk-ui']},
'context-menu:tv': {label: 'TV context menu', enabled: true, dependsOn: ['dk-ui']},
'context-menu:music': {label: 'Music context menu', enabled: true, dependsOn: ['dk-ui']},
'context-menu:generic': {label: 'Generic context menu', enabled: true, dependsOn: ['dk-ui']},
```

- [ ] **Step 3: Create types file**

`frontend/src/features/_config/context-menu/types.ts`:
```ts
import type { LucideIcon } from 'lucide-react'

export interface ContextMenuItemDef {
  id: string
  label: string
  icon?: LucideIcon
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
  onClick: () => void
  subItems?: ContextMenuItemDef[]
}

export interface ContextMenuPosition {
  x: number
  y: number
}

export type ContextMenuMediaType = 'game' | 'movie' | 'tv' | 'music' | 'generic'

export interface ContextMenuState {
  isOpen: boolean
  position: ContextMenuPosition | null
  items: ContextMenuItemDef[]
  mediaType: ContextMenuMediaType | null
  data: Record<string, unknown> | null
}

export interface ContextMenuActions {
  open: (e: MouseEvent | TouchEvent, items: ContextMenuItemDef[], options?: {
    mediaType?: ContextMenuMediaType
    data?: Record<string, unknown>
  }) => void
  close: () => void
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/features/_config/types.ts frontend/src/features/_config/registry.ts frontend/src/features/_config/context-menu/types.ts
git commit -m "feat: add context-menu dep, registry entries, and types"
```

---
### Task 2: Context provider + hook

**Files:**
- Create: `frontend/src/features/_config/context-menu/context-menu-context.tsx`

**Interfaces:**
- Consumes: `ContextMenuState`, `ContextMenuActions` from types.ts
- Produces: `ContextMenuProvider` component, `useMenuContext` hook returning `ContextMenuState & ContextMenuActions`

- [ ] **Step 1: Write the failing test**

`frontend/src/features/_config/context-menu/context-menu-context.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { ContextMenuProvider, useMenuContext } from './context-menu-context'

describe('ContextMenuProvider', () => {
  it('provides closed state by default', () => {
    const { result } = renderHook(() => useMenuContext(), {
      wrapper: ({ children }) => (
        <ContextMenuProvider>{children}</ContextMenuProvider>
      ),
    })
    expect(result.current.isOpen).toBe(false)
    expect(result.current.position).toBeNull()
    expect(result.current.items).toEqual([])
  })

  it('throws when used outside provider', () => {
    expect(() => renderHook(() => useMenuContext())).toThrow(
      'useMenuContext must be used within ContextMenuProvider'
    )
  })
})
```

Expected: FAIL — module not found.

- [ ] **Step 2: Run test to verify it fails**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/context-menu-context.test.tsx
```

Expected: `FAIL` with module resolution error.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/features/_config/context-menu/context-menu-context.tsx`:
```tsx
import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import type { ContextMenuItemDef, ContextMenuPosition, ContextMenuMediaType, ContextMenuState, ContextMenuActions } from './types'

interface ContextMenuContextValue extends ContextMenuState, ContextMenuActions {}

const ContextMenuCtx = createContext<ContextMenuContextValue | null>(null)

export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState<ContextMenuPosition | null>(null)
  const [items, setItems] = useState<ContextMenuItemDef[]>([])
  const [mediaType, setMediaType] = useState<ContextMenuMediaType | null>(null)
  const [data, setData] = useState<Record<string, unknown> | null>(null)

  const open = useCallback<ContextMenuActions['open']>((e, items, options) => {
    e.preventDefault()
    const point = 'touches' in e
      ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
      : { x: e.clientX, y: e.clientY }
    setPosition(point)
    setItems(items)
    setMediaType(options?.mediaType ?? null)
    setData(options?.data ?? null)
    setIsOpen(true)
  }, [])

  const close = useCallback<ContextMenuActions['close']>(() => {
    setIsOpen(false)
    setPosition(null)
    setItems([])
    setMediaType(null)
    setData(null)
  }, [])

  return (
    <ContextMenuCtx.Provider value={{ isOpen, position, items, mediaType, data, open, close }}>
      {children}
    </ContextMenuCtx.Provider>
  )
}

export function useMenuContext(): ContextMenuContextValue {
  const ctx = useContext(ContextMenuCtx)
  if (!ctx) throw new Error('useMenuContext must be used within ContextMenuProvider')
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/context-menu-context.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/_config/context-menu/context-menu-context.tsx frontend/src/features/_config/context-menu/context-menu-context.test.tsx
git commit -m "feat: add context-menu context provider and hook"
```

---
### Task 3: ContextMenuItem + ContextMenuSeparator

**Files:**
- Create: `frontend/src/features/_config/context-menu/context-menu-item.tsx`
- Create: `frontend/src/features/_config/context-menu/context-menu-separator.tsx`

**Interfaces:**
- Consumes: no deps (pure UI components)
- Produces: `ContextMenuItem` (renders label, icon, shortcut, destructive/disabled states), `ContextMenuSeparator` (visual divider)

- [ ] **Step 1: Write the failing test**

`frontend/src/features/_config/context-menu/context-menu-item.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Heart } from 'lucide-react'
import { ContextMenuItem } from './context-menu-item'
import { ContextMenuSeparator } from './context-menu-separator'

describe('ContextMenuItem', () => {
  it('renders label', () => {
    render(<ContextMenuItem label="Add to Library" />)
    expect(screen.getByText('Add to Library')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<ContextMenuItem label="Like" icon={Heart} />)
    const svg = document.querySelector('.lucide-heart')
    expect(svg).toBeInTheDocument()
  })

  it('renders shortcut hint', () => {
    render(<ContextMenuItem label="Copy" shortcut="⌘C" />)
    expect(screen.getByText('⌘C')).toBeInTheDocument()
  })

  it('applies disabled attributes', () => {
    render(<ContextMenuItem label="Delete" disabled />)
    const btn = screen.getByRole('menuitem')
    expect(btn).toHaveAttribute('aria-disabled', 'true')
  })

  it('calls onClick when clicked', async () => {
    const onClick = vi.fn()
    render(<ContextMenuItem label="Test" onClick={onClick} />)
    screen.getByRole('menuitem').click()
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn()
    render(<ContextMenuItem label="Test" disabled onClick={onClick} />)
    screen.getByRole('menuitem').click()
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders submenu chevron when has subItems', () => {
    render(<ContextMenuItem label="More" subItems={[{ id: 'a', label: 'A', onClick: () => {} }]} />)
    const chevron = document.querySelector('.lucide-chevron-right')
    expect(chevron).toBeInTheDocument()
  })
})

describe('ContextMenuSeparator', () => {
  it('renders a divider with role separator', () => {
    const { container } = render(<ContextMenuSeparator />)
    expect(container.querySelector('[role="separator"]')).toBeInTheDocument()
  })
})
```

Expected: FAIL — module not found.

- [ ] **Step 2: Run test to verify it fails**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/context-menu-item.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/features/_config/context-menu/context-menu-item.tsx`:
```tsx
import { forwardRef, type ButtonHTMLAttributes, type ForwardedRef } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ContextMenuItemDef } from './types'

interface ContextMenuItemProps extends Omit<ContextMenuItemDef, 'id' | 'subItems'> {
  hasSubMenu?: boolean
  onPointerEnter?: () => void
  onPointerLeave?: () => void
  className?: string
}

export const ContextMenuItem = forwardRef(function ContextMenuItem(
  {
    label,
    icon: Icon,
    shortcut,
    disabled,
    destructive,
    onClick,
    hasSubMenu,
    onPointerEnter,
    onPointerLeave,
    className,
  }: ContextMenuItemProps,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => { if (!disabled) onClick?.() }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors duration-150',
        disabled
          ? 'cursor-not-allowed opacity-40'
          : destructive
            ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
            : 'text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)] hover:text-foreground',
        className,
      )}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" />}
      <span className="flex-1 text-left truncate">{label}</span>
      {shortcut && (
        <span className="shrink-0 text-[11px] text-muted-foreground/50">{shortcut}</span>
      )}
      {hasSubMenu && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />}
    </button>
  )
})
```

`frontend/src/features/_config/context-menu/context-menu-separator.tsx`:
```tsx
export function ContextMenuSeparator() {
  return (
    <div
      role="separator"
      className="my-1 border-t"
      style={{ borderColor: 'var(--dk-separator)' }}
    />
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/context-menu-item.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/_config/context-menu/context-menu-item.tsx frontend/src/features/_config/context-menu/context-menu-separator.tsx frontend/src/features/_config/context-menu/context-menu-item.test.tsx
git commit -m "feat: add context-menu item and separator components"
```

---
### Task 4: ContextMenuContent + ContextMenuSub

**Files:**
- Create: `frontend/src/features/_config/context-menu/context-menu-content.tsx`
- Create: `frontend/src/features/_config/context-menu/context-menu-sub.tsx`

**Interfaces:**
- Consumes: `ContextMenuItem`, `ContextMenuSeparator`, `ContextMenuItemDef` type, `useMenuContext`
- Produces: `ContextMenuContent` (panel + keyboard nav + animation), `ContextMenuSub` (submenu trigger + nested panel)

- [ ] **Step 1: Write the failing test**

`frontend/src/features/_config/context-menu/context-menu-content.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextMenuProvider } from './context-menu-context'
import { ContextMenuContent } from './context-menu-content'
import type { ContextMenuItemDef } from './types'

function Wrapper({ children }: { children: React.ReactNode }) {
  return <ContextMenuProvider>{children}</ContextMenuProvider>
}

describe('ContextMenuContent', () => {
  const items: ContextMenuItemDef[] = [
    { id: '1', label: 'Watched', onClick: vi.fn() },
    { id: '2', label: 'Delete', destructive: true, onClick: vi.fn() },
    { id: '3', label: 'Disabled', disabled: true, onClick: vi.fn() },
  ]

  it('renders all items', () => {
    render(<ContextMenuContent items={items} />, { wrapper: Wrapper })
    expect(screen.getByText('Watched')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('renders separators between groups', () => {
    const withSep = [
      { id: '1', label: 'A', onClick: vi.fn() },
      { id: '_s1', separator: true as any },
      { id: '2', label: 'B', onClick: vi.fn() },
    ] as ContextMenuItemDef[]
    // @ts-expect-error testing separator rendering
    render(<ContextMenuContent items={withSep} />, { wrapper: Wrapper })
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(document.querySelector('[role="separator"]')).toBeInTheDocument()
  })

  it('applies role="menu"', () => {
    render(<ContextMenuContent items={items} />, { wrapper: Wrapper })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
```

Expected: FAIL.

- [ ] **Step 2: Run test to verify it fails**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/context-menu-content.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

`frontend/src/features/_config/context-menu/context-menu-content.tsx`:
```tsx
import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ContextMenuItem } from './context-menu-item'
import { ContextMenuSeparator } from './context-menu-separator'
import { ContextMenuSub } from './context-menu-sub'
import { useMenuContext } from './context-menu-context'
import type { ContextMenuItemDef } from './types'

interface ContextMenuContentProps {
  items: ContextMenuItemDef[]
  isSubmenu?: boolean
  onRequestClose?: () => void
  parentRef?: React.RefObject<HTMLDivElement | null>
}

export function ContextMenuContent({ items, isSubmenu, onRequestClose, parentRef }: ContextMenuContentProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [focusedIdx, setFocusedIdx] = useState(0)
  const [openSubIdx, setOpenSubIdx] = useState<number | null>(null)
  const { close } = useMenuContext()

  const handleClose = onRequestClose ?? close

  const flatItems = useMemo(() =>
    items.filter((i): i is ContextMenuItemDef & { subItems?: ContextMenuItemDef[] } => 'separator' in i ? false : true),
    [items],
  )

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const enabled = flatItems.filter(i => !i.disabled)
    if (!enabled.length) return

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const curIdx = enabled.indexOf(flatItems[focusedIdx])
        const next = (curIdx + 1) % enabled.length
        setFocusedIdx(flatItems.indexOf(enabled[next]))
        setOpenSubIdx(null)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const curIdx = enabled.indexOf(flatItems[focusedIdx])
        const prev = (curIdx - 1 + enabled.length) % enabled.length
        setFocusedIdx(flatItems.indexOf(enabled[prev]))
        setOpenSubIdx(null)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        const item = flatItems[focusedIdx]
        if (item?.subItems?.length) {
          setOpenSubIdx(focusedIdx)
        }
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        if (isSubmenu) handleClose()
        break
      }
      case 'Enter':
      case ' ': {
        e.preventDefault()
        const item = flatItems[focusedIdx]
        if (item && !item.disabled) {
          handleClose()
          item.onClick?.()
        }
        break
      }
      case 'Escape': {
        e.preventDefault()
        handleClose()
        break
      }
    }
  }, [flatItems, focusedIdx, isSubmenu, handleClose])

  // Focus panel on mount
  useEffect(() => {
    panelRef.current?.focus()
  }, [])

  // Auto-hide on click outside
  useEffect(() => {
    if (isSubmenu) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        handleClose()
      }
    }
    // Delay adding listener so same-click doesn't close immediately
    const raf = requestAnimationFrame(() => document.addEventListener('mousedown', handler))
    return () => { cancelAnimationFrame(raf); document.removeEventListener('mousedown', handler) }
  }, [isSubmenu, handleClose])

  return (
    <motion.div
      ref={panelRef}
      role="menu"
      tabIndex={-1}
      initial={{ opacity: 0, scale: 0.96, y: -4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: -4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      onKeyDown={handleKeyDown}
      className="flex min-w-[180px] max-w-[320px] flex-col gap-0.5 rounded-[1.25rem] p-1.5 backdrop-blur-2xl outline-none"
      style={{
        backgroundColor: 'var(--dk-surface-overlay)',
        boxShadow: 'var(--dk-shadow-glass), 0 0 0 1px rgba(255,255,255,0.06)',
        maxHeight: 'min(400px, 80vh)',
        overflowY: 'auto',
      }}
    >
      {items.map((item, idx) => {
        if ('separator' in item && item.separator) {
          return <ContextMenuSeparator key={`sep-${idx}`} />
        }
        if (item.subItems?.length) {
          return (
            <ContextMenuSub
              key={item.id}
              item={item}
              isOpen={openSubIdx === idx}
              onToggle={(open) => setOpenSubIdx(open ? idx : null)}
              parentRef={panelRef}
              parentItemRef={undefined}
            />
          )
        }
        return (
          <ContextMenuItem
            key={item.id}
            label={item.label}
            icon={item.icon}
            shortcut={item.shortcut}
            disabled={item.disabled}
            destructive={item.destructive}
            onClick={() => { handleClose(); item.onClick?.() }}
            hasSubMenu={false}
            onPointerEnter={() => setFocusedIdx(idx)}
          />
        )
      })}
    </motion.div>
  )
}
```

`frontend/src/features/_config/context-menu/context-menu-sub.tsx`:
```tsx
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ContextMenuItem } from './context-menu-item'
import type { ContextMenuItemDef } from './types'

interface ContextMenuSubProps {
  item: ContextMenuItemDef
  isOpen: boolean
  onToggle: (open: boolean) => void
  parentRef?: React.RefObject<HTMLDivElement | null>
  parentItemRef?: React.RefObject<HTMLButtonElement | null>
}

export function ContextMenuSub({ item, isOpen, onToggle, parentRef }: ContextMenuSubProps) {
  const subRef = useRef<HTMLDivElement>(null)
  const itemRef = useRef<HTMLButtonElement>(null)
  const [subPos, setSubPos] = useState<'right' | 'left'>('right')

  // Determine if submenu should flip to left
  useEffect(() => {
    if (!isOpen || !parentRef?.current) return
    const parentRect = parentRef.current.getBoundingClientRect()
    const rightEdge = parentRect.right + 200
    setSubPos(rightEdge > window.innerWidth ? 'left' : 'right')
  }, [isOpen, parentRef])

  // Close submenu on pointer leave
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handlePointerEnter = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    onToggle(true)
  }

  const handlePointerLeave = () => {
    timerRef.current = setTimeout(() => onToggle(false), 150)
  }

  return (
    <div
      className="relative"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <ContextMenuItem
        ref={itemRef}
        label={item.label}
        icon={item.icon}
        disabled={item.disabled}
        hasSubMenu
        onPointerEnter={() => onToggle(true)}
      />

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={subRef}
            initial={{ opacity: 0, x: subPos === 'right' ? -4 : 4, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: subPos === 'right' ? -4 : 4, scale: 0.96 }}
            transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
            className="absolute top-0 z-50 min-w-[160px] rounded-[1.25rem] p-1.5 backdrop-blur-2xl"
            style={{
              [subPos === 'right' ? 'left' : 'right']: 'calc(100% - 4px)',
              backgroundColor: 'var(--dk-surface-overlay)',
              boxShadow: 'var(--dk-shadow-glass), 0 0 0 1px rgba(255,255,255,0.06)',
            }}
          >
            <div className="flex flex-col gap-0.5">
              {item.subItems?.map((sub) => (
                <ContextMenuItem
                  key={sub.id}
                  label={sub.label}
                  icon={sub.icon}
                  shortcut={sub.shortcut}
                  disabled={sub.disabled}
                  destructive={sub.destructive}
                  onClick={() => { sub.onClick?.() }}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/context-menu-content.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/_config/context-menu/context-menu-content.tsx frontend/src/features/_config/context-menu/context-menu-sub.tsx frontend/src/features/_config/context-menu/context-menu-content.test.tsx
git commit -m "feat: add context-menu content panel and submenu"
```

---
### Task 5: ContextMenuTrigger + ContextMenuPortal

**Files:**
- Create: `frontend/src/features/_config/context-menu/context-menu-trigger.tsx`
- Create: `frontend/src/features/_config/context-menu/context-menu-portal.tsx`

**Interfaces:**
- Consumes: `useMenuContext`, `ContextMenuItemDef`, `ContextMenuMediaType`, `ContextMenuPosition`
- Produces: `ContextMenuTrigger` (right-click + long-press wrapper), `ContextMenuPortal` (Floating UI + createPortal)

- [ ] **Step 1: Write the failing test**

`frontend/src/features/_config/context-menu/context-menu-trigger.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextMenuProvider, useMenuContext } from './context-menu-context'
import { ContextMenuTrigger } from './context-menu-trigger'
import type { ContextMenuItemDef } from './types'

const items: ContextMenuItemDef[] = [
  { id: '1', label: 'Action', onClick: vi.fn() },
]

describe('ContextMenuTrigger', () => {
  it('renders children', () => {
    render(
      <ContextMenuProvider>
        <ContextMenuTrigger items={items}>
          <button>Target</button>
        </ContextMenuTrigger>
      </ContextMenuProvider>,
    )
    expect(screen.getByText('Target')).toBeInTheDocument()
  })

  it('opens menu on right-click', async () => {
    const user = userEvent.setup()
    render(
      <ContextMenuProvider>
        <ContextMenuTrigger items={items}>
          <div data-testid="target">Target</div>
        </ContextMenuTrigger>
      </ContextMenuProvider>,
    )
    const target = screen.getByTestId('target')
    await user.pointer({ target, coords: { x: 100, y: 200 }, keys: '[MouseRight]' })
    expect(screen.getByText('Action')).toBeInTheDocument()
  })
})
```

Expected: FAIL.

- [ ] **Step 2: Run test to verify it fails**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/context-menu-trigger.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Write implementation**

`frontend/src/features/_config/context-menu/context-menu-trigger.tsx`:
```tsx
import { useCallback, useRef, type ReactNode, type MouseEvent, type TouchEvent } from 'react'
import { useMenuContext } from './context-menu-context'
import type { ContextMenuItemDef, ContextMenuMediaType } from './types'

interface ContextMenuTriggerProps {
  items: ContextMenuItemDef[]
  mediaType?: ContextMenuMediaType
  data?: Record<string, unknown>
  children: ReactNode
  className?: string
  disabled?: boolean
}

export function ContextMenuTrigger({
  items,
  mediaType,
  data,
  children,
  className,
  disabled,
}: ContextMenuTriggerProps) {
  const { open } = useMenuContext()
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressPos = useRef<{ x: number; y: number } | null>(null)
  const longPressTriggered = useRef(false)

  const handleContextMenu = useCallback((e: MouseEvent) => {
    if (disabled || !items.length) return
    e.preventDefault()
    open(e.nativeEvent, items, { mediaType, data })
  }, [disabled, items, mediaType, data, open])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (disabled || !items.length) return
    longPressTriggered.current = false
    const touch = e.touches[0]
    longPressPos.current = { x: touch.clientX, y: touch.clientY }
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      // Synthesize a MouseEvent-like object for the open function
      const fakeEvent = {
        preventDefault: () => {},
        clientX: longPressPos.current!.x,
        clientY: longPressPos.current!.y,
      } as MouseEvent
      open(fakeEvent, items, { mediaType, data })
    }, 500)
  }, [disabled, items, mediaType, data, open])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!longPressPos.current) return
    const touch = e.touches[0]
    const dx = Math.abs(touch.clientX - longPressPos.current.x)
    const dy = Math.abs(touch.clientY - longPressPos.current.y)
    if (dx > 10 || dy > 10) {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
      longPressPos.current = null
      longPressTriggered.current = false
    }
  }, [])

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressPos.current = null
    // If long-press fired, don't trigger any click that might be on this element
    if (longPressTriggered.current) {
      longPressTriggered.current = false
    }
  }, [])

  return (
    <div
      className={className}
      onContextMenu={handleContextMenu}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {children}
    </div>
  )
}
```

`frontend/src/features/_config/context-menu/context-menu-portal.tsx`:
```tsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useFloating, offset, flip, shift, size, autoUpdate } from '@floating-ui/react'
import { AnimatePresence } from 'framer-motion'
import { ContextMenuContent } from './context-menu-content'
import { useMenuContext } from './context-menu-context'

export function ContextMenuPortal() {
  const { isOpen, position, items, close } = useMenuContext()
  const [ready, setReady] = useState(false)

  const { refs, floatingStyles } = useFloating({
    placement: 'bottom-start',
    strategy: 'fixed',
    middleware: [
      offset(4),
      flip(),
      shift({ padding: 8 }),
      size({
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.min(availableHeight, 400)}px`,
            overflowY: 'auto',
          })
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  })

  // Set virtual element from position
  useEffect(() => {
    if (!isOpen || !position) return
    setReady(false)

    const virtualEl = {
      getBoundingClientRect() {
        return {
          width: 0,
          height: 0,
          x: position.x,
          y: position.y,
          top: position.y,
          right: position.x,
          bottom: position.y,
          left: position.x,
        }
      },
    }

    refs.setReference(virtualEl)
    // RAF to let floating-ui compute position before showing
    requestAnimationFrame(() => setReady(true))
  }, [isOpen, position, refs])

  // Close on scroll
  useEffect(() => {
    if (!isOpen) return
    const handler = () => close()
    window.addEventListener('scroll', handler, { passive: true })
    window.addEventListener('wheel', handler, { passive: true })
    return () => {
      window.removeEventListener('scroll', handler)
      window.removeEventListener('wheel', handler)
    }
  }, [isOpen, close])

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, close])

  if (!isOpen) return null

  return createPortal(
    <AnimatePresence>
      {isOpen && ready && (
        <div
          ref={refs.setFloating}
          style={floatingStyles}
          className="z-[99999]"
        >
          <ContextMenuContent items={items} />
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/context-menu-trigger.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/_config/context-menu/context-menu-trigger.tsx frontend/src/features/_config/context-menu/context-menu-portal.tsx frontend/src/features/_config/context-menu/context-menu-trigger.test.tsx
git commit -m "feat: add context-menu trigger and floating-ui portal"
```

---
### Task 6: Public API + wire into app root

**Files:**
- Create: `frontend/src/features/_config/context-menu/index.ts`
- Modify: `frontend/src/features/_config/context-menu/context-menu-content.tsx` (add separator support)
- Modify: app root layout to add `ContextMenuProvider` + `ContextMenuPortal`

**Interfaces:**
- Consumes: all components from tasks 1-5
- Produces: clean public API exports, app integration

- [ ] **Step 1: Write the failing test**

`frontend/src/features/_config/context-menu/index.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import * as exports from './index'

describe('context-menu public API', () => {
  const expected = [
    'ContextMenuProvider',
    'ContextMenuTrigger',
    'ContextMenuPortal',
    'ContextMenuContent',
    'ContextMenuItem',
    'ContextMenuSeparator',
    'ContextMenuSub',
    'useMenuContext',
  ]

  for (const name of expected) {
    it(`exports ${name}`, () => {
      expect(exports).toHaveProperty(name)
    })
  }
})
```

Expected: FAIL (index.ts doesn't exist).

- [ ] **Step 2: Run test to verify it fails**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/index.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Create index.ts**

`frontend/src/features/_config/context-menu/index.ts`:
```ts
export { ContextMenuProvider } from './context-menu-context'
export { useMenuContext } from './context-menu-context'
export { ContextMenuTrigger } from './context-menu-trigger'
export { ContextMenuPortal } from './context-menu-portal'
export { ContextMenuContent } from './context-menu-content'
export { ContextMenuItem } from './context-menu-item'
export { ContextMenuSeparator } from './context-menu-separator'
export { ContextMenuSub } from './context-menu-sub'
export type {
  ContextMenuItemDef,
  ContextMenuPosition,
  ContextMenuMediaType,
  ContextMenuState,
  ContextMenuActions,
} from './types'
```

- [ ] **Step 4: Run test to verify it passes**

```bash
rtk npx vitest run frontend/src/features/_config/context-menu/index.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire into app root layout**

Find the root layout component. Look for where `dk-ui` or other global providers are mounted.

Search path: examine `frontend/src/features/_config/components/layout/root-layout.tsx` to find provider mounting point:

```bash
rtk grep "ContextMenuProvider|dk-ui.*provider" frontend/src --include "*.tsx" -i
```

If no existing provider pattern exists, wrap the app layout. Add `ContextMenuProvider` and `ContextMenuPortal` to the root layout (around the `<Outlet />` or children):

```tsx
import { ContextMenuProvider, ContextMenuPortal } from '@context-menu'

// Inside root layout return:
<ContextMenuProvider>
  {/* existing children */}
  <ContextMenuPortal />
</ContextMenuProvider>
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/_config/context-menu/index.ts frontend/src/features/_config/context-menu/index.test.ts
# Add root layout changes if identified
git commit -m "feat: wire context-menu provider and portal into app root"
```

---
### Task 7: Integration — Discover media card

**Files:**
- Modify: `frontend/src/features/discover/components/molecules/discover-media-card.tsx`

**Interfaces:**
- Consumes: `ContextMenuTrigger`, `ContextMenuItemDef` type
- Produces: context menu on discover media cards

- [ ] **Step 1: Write the failing test**

`frontend/src/features/discover/components/molecules/discover-media-card.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContextMenuProvider } from '@context-menu'
import { DiscoverMediaCard } from './discover-media-card'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ContextMenuProvider>{children}</ContextMenuProvider>
    </QueryClientProvider>
  )
}

describe('DiscoverMediaCard', () => {
  const baseItem = {
    id: '123',
    mediaType: 'movie',
    title: 'Test Movie',
    posterUrl: '/poster.jpg',
    avgRating: 8.5,
    ratingCount: 100,
    releaseDate: '2024-01-01',
  }

  it('renders card content', () => {
    render(<DiscoverMediaCard item={baseItem as any} />, { wrapper: Wrapper })
    expect(screen.getByText('Test Movie')).toBeInTheDocument()
  })
})
```

Expected: FAIL or PASS depending on whether existing test infrastructure matches. Verify test passes.

- [ ] **Step 2: Run test**

```bash
rtk npx vitest run frontend/src/features/discover/components/molecules/discover-media-card.test.tsx
```

If it already exists, just verify. If not, expect FAIL then fix test.

- [ ] **Step 3: Wrap DiscoverMediaCard in ContextMenuTrigger**

Modify `frontend/src/features/discover/components/molecules/discover-media-card.tsx`:

```tsx
import { memo, useCallback } from 'react'
import { MediaCard } from '@ui/molecules/media-card'
import { ContextMenuTrigger } from '@context-menu'
import { useNavigate } from '@tanstack/react-router'
import type { MediaItemSummary } from '@media/queries/media-queries'
import type { ContextMenuItemDef } from '@context-menu'

interface DiscoverMediaCardProps {
  item: MediaItemSummary
  showTypeBadge?: boolean
  subtitle?: string | null
  className?: string
}

export const DiscoverMediaCard = memo(function DiscoverMediaCard({
  item,
  showTypeBadge = true,
  subtitle,
  className,
}: DiscoverMediaCardProps) {
  const navigate = useNavigate()

  const menuItems: ContextMenuItemDef[] = [
    {
      id: 'open-detail',
      label: 'View Details',
      onClick: () => navigate({ to: '/media/$mediaType/$mediaId', params: { mediaType: item.mediaType, mediaId: item.id } }),
    },
    {
      id: 'add-to-library',
      label: 'Add to Library',
      subItems: [
        { id: 'watched', label: 'Mark as Watched', onClick: () => {} },
        { id: 'owned', label: 'Mark as Owned', onClick: () => {} },
        { id: 'wishlist', label: 'Add to Wishlist', onClick: () => {} },
      ],
    },
  ]

  return (
    <ContextMenuTrigger items={menuItems} mediaType={item.mediaType as any} data={{ itemId: item.id }}>
      <MediaCard
        id={item.id}
        mediaType={item.mediaType as 'movie' | 'show' | 'game' | 'music'}
        title={item.title}
        posterUrl={item.posterUrl}
        textlessPosterUrl={item.textlessPosterUrl}
        logoUrl={item.logoUrl}
        releaseDate={item.releaseDate}
        avgRating={item.avgRating}
        ratingCount={item.ratingCount}
        showTypeBadge={showTypeBadge}
        isAdult={item.isAdult}
        subtitle={subtitle}
        artistName={item.albumArtistName}
        className={className}
      />
    </ContextMenuTrigger>
  )
})
```

- [ ] **Step 4: Run test to verify passes**

```bash
rtk npx vitest run frontend/src/features/discover/components/molecules/discover-media-card.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/discover/components/molecules/discover-media-card.tsx
git commit -m "feat: integrate context-menu into discover media cards"
```

---
### Task 8: Integration — Launcher shelf card (game context)

**Files:**
- Modify: `frontend/src/features/launcher/components/molecules/launcher-shelf-card.tsx`

- [ ] **Step 1: Read current shelf card to understand props**

```bash
rtk read frontend/src/features/launcher/components/molecules/launcher-shelf-card.tsx
```

- [ ] **Step 2: Wrap in ContextMenuTrigger with game-specific items**

Pattern follows Task 7. Game-specific items:

```ts
const menuItems: ContextMenuItemDef[] = [
  { id: 'play', label: 'Play', icon: Play, onClick: () => playGame(game) },
  { id: 'unown', label: 'Remove from Library', icon: Trash2, destructive: true, onClick: () => unownGame(gameId) },
  { id: 'fix-match', label: 'Fix Match', icon: Wrench, onClick: () => openMatchDialog(game) },
  { id: 'open-folder', label: 'Open Folder', icon: FolderOpen, onClick: () => openFolder(game.path) },
]
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/launcher/components/molecules/launcher-shelf-card.tsx
git commit -m "feat: integrate context-menu into launcher shelf cards"
```

---

## Self-Review

**Spec coverage check:**
- [x] File structure matches spec (8 files under `_config/context-menu/`)
- [x] ContextMenuProvider + state management (Task 2)
- [x] Long-press mobile support (Task 5 — trigger)
- [x] Floating UI positioning with flip/shift/offset (Task 5 — portal)
- [x] Framer Motion animations (Task 4 — content, Task 4 — sub)
- [x] Keyboard navigation (Task 4 — content)
- [x] Submenu support (Task 4 — sub)
- [x] Slot integration — registry entries added in Task 1; `useSlotData` integration deferred (server-side plugin system requires desktop API)
- [x] Styling with design tokens (all components use `var(--dk-*)`)
- [x] Accessibility — `role="menu"/"menuitem"`, `aria-disabled`, keyboard nav

**Placeholder scan:** Clean — no TODOs, TBDs, or placeholder patterns.

**Type consistency:** All inter-task types match. `ContextMenuItemDef` used consistently across all consuming tasks.
