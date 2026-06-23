# Context Menu Framework

**Date**: 2026-06-23  
**Status**: Approved design

## Overview

Universal context menu framework for Otix. Handles right-click (desktop) and long-press (mobile) with submenu support, keyboard navigation, smooth animations, and full plugin-system integration.

## Architecture

```
ContextMenuProvider (React Context at app root)
  ↕ dispatches open/close
ContextMenuTrigger (wraps any element)
  → right-click or long-press → synthesizes contextmenu event
ContextMenuPortal (createPortal → document.body)
  → Floating UI positions panel
ContextMenuContent (panel + keyboard nav + animation)
  ├── ContextMenuItem (leaf action)
  ├── ContextMenuSeparator (divider)
  └── ContextMenuSub (nested trigger + content)
```

## File Structure

```
frontend/src/features/_config/context-menu/
├── context-menu-context.tsx      # Provider + useMenuContext hook
├── context-menu-trigger.tsx      # Right-click + long-press handler
├── context-menu-portal.tsx       # createPortal + Floating UI
├── context-menu-content.tsx      # Panel + keyboard nav + animation
├── context-menu-item.tsx         # Single action row
├── context-menu-separator.tsx    # Divider
├── context-menu-sub.tsx          # Submenu trigger + nested panel
└── index.ts                      # Public API re-exports
```

## State (ContextMenuProvider)

```ts
interface ContextMenuState {
  isOpen: boolean
  position: { x: number; y: number } | null
  items: ContextMenuItemDef[]
  data: Record<string, unknown> | null
}

interface ContextMenuItemDef {
  id: string
  label: string
  icon?: LucideIcon
  shortcut?: string
  disabled?: boolean
  destructive?: boolean
  onClick: (data?: Record<string, unknown>) => void
  subItems?: ContextMenuItemDef[]
}
```

Actions: `open(e, items, data?)`, `close()`. Close triggers: item click, Escape, click outside, scroll (configurable), route change.

## Positioning & Animation

- **Library**: `@floating-ui/react` — middleware: `offset(4)`, `flip()`, `shift({padding: 8})`, `size({apply: clamp height})`
- **Portal**: rendered into `document.body` via `createPortal`
- **Animation**: Framer Motion — `opacity 0→1`, `scale 0.96→1`, `y -4→0`, 150ms, ease `[0.16, 1, 0.3, 1]`
- **Submenu**: slides from right, `x -4→0`
- **Placement**: `bottom-start` from cursor, auto-flips on overflow

## Mobile Long-Press

`touchstart` → 500ms timer → `touchend`/`touchmove >10px` cancels. Timer fires → dispatches synthetic `onContextMenu` with touch coordinates. Same rendering path as desktop.

## Slot Integration

Slot names: `context-menu:game`, `context-menu:movie`, `context-menu:tv`, `context-menu:music`, `context-menu:generic`

Registered in `_config/registry.ts` with dependency on `dk-ui`. Features contribute items via `useSlotData()`, merging with local (inline) items. Plugins can also contribute through same slot.

## Component API

```tsx
<ContextMenuProvider>
  <ContextMenuTrigger>
    <MediaCard />                    {/* trigger element */}
    <ContextMenuContent>             {/* panel */}
      <ContextMenuItem icon={Eye} onClick={markWatched}>
        Mark as Watched
      </ContextMenuItem>
      <ContextMenuSeparator />
      <ContextMenuSub label="Add to List">
        <ContextMenuItem>My Favorites</ContextMenuItem>
        <ContextMenuItem>Watch Later</ContextMenuItem>
      </ContextMenuSub>
      <ContextMenuItem destructive icon={Trash2} onClick={remove}>
        Remove from Library
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenuTrigger>
</ContextMenuProvider>
```

Composition via hook for slot-based items:
```tsx
const ctx = useContextMenu()
<button onContextMenu={(e) => ctx.open(e, items)} />
```

## Styling

- Panel: glass surface (`var(--dk-surface-overlay)`), backdrop blur, `rounded-[1.25rem]`, glass shadow, thin border glow
- Items: `rounded-xl`, `py-2 px-3`, hover state `var(--dk-surface-ghost-hover)`, active `var(--dk-surface-ghost-active)`
- Destructive items: `text-red-400` / `hover:bg-red-500/10`
- Separator: `border-t` with `var(--dk-separator)`
- Max height: `min(400px, 80vh)` with scroll
- Min width: `180px`, max width: `320px`

## Keyboard Navigation

| Key | Action |
|-----|--------|
| ArrowDown | Next item (wrap) |
| ArrowUp | Previous item (wrap) |
| Enter | Activate item |
| ArrowRight | Open submenu (if has subItems) |
| ArrowLeft | Close submenu / go to parent |
| Escape | Close entire menu |
| Tab | Close menu (escape focus) |

## Error Handling

- No items → don't open (no-op click)
- Slot contribution fails → catch in slot boundary, log, skip that contribution
- Item onClick throws → console.error, close menu
- Floating UI positioning fails → fallback to `top: 0; left: 0` with static placement

## Accessibility

- `role="menu"` on panel, `role="menuitem"` on items
- `aria-disabled` on disabled items
- Focus trap within open menu
- `aria-haspopup="menu"` on trigger
- Focus returns to trigger on close
