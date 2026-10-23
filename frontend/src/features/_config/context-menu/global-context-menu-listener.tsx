import { useEffect, useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useModal } from '@/lib/modals'
import { useOptionalMenuContext } from './context-menu-context'
import { resolveContextMenuTarget } from './utils/dom-resolver'
import {
  buildMediaMenuItems,
  buildGameMenuItems,
  buildEpisodeMenuItems,
  buildSeasonMenuItems,
  buildGenreMenuItems,
  buildDownloadMenuItems,
  buildUserMenuItems,
  buildVideoMenuItems,
  buildPersonMenuItems,
  buildListMenuItems,
  buildTrackMenuItems,
  buildLinkMenuItems,
  buildImageMenuItems,
  buildTextMenuItems,
  buildInputMenuItems,
  buildPageMenuItems,
} from './utils/menu-builders'
import type { ContextMenuItemDef } from './types'

export const GlobalContextMenuListener = () => {
  const menu = useOptionalMenuContext()
  const navigate = useNavigate()
  const { openModal } = useModal()

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      // 1. If explicit ContextMenuTrigger already handled the event, ignore
      if (e.defaultPrevented || !menu) return

      // 2. Allow Shift + Right-Click to open the native browser context menu
      if (e.shiftKey) return

      const target = resolveContextMenuTarget(
        e.target as HTMLElement | null,
        typeof window !== 'undefined' ? window.getSelection() : null,
      )

      let items: ContextMenuItemDef[] = []
      const context = { navigate, openModal }

      switch (target.type) {
        case 'media':
          items = buildMediaMenuItems(target, context)
          break
        case 'game':
          items = buildGameMenuItems(target, context)
          break
        case 'episode':
          items = buildEpisodeMenuItems(target, context)
          break
        case 'season':
          items = buildSeasonMenuItems(target, context)
          break
        case 'genre':
          items = buildGenreMenuItems(target, context)
          break
        case 'download':
          items = buildDownloadMenuItems(target, context)
          break
        case 'user':
          items = buildUserMenuItems(target, context)
          break
        case 'video':
          items = buildVideoMenuItems(target)
          break
        case 'person':
          items = buildPersonMenuItems(target, context)
          break
        case 'list':
          items = buildListMenuItems(target, context)
          break
        case 'track':
          items = buildTrackMenuItems(target, context)
          break
        case 'link':
          items = buildLinkMenuItems(target, context)
          break
        case 'image':
          items = buildImageMenuItems(target, context)
          break
        case 'text':
          items = buildTextMenuItems(target, context)
          break
        case 'input':
          items = buildInputMenuItems(target)
          break
        case 'page':
          items = buildPageMenuItems(target, context)
          break
      }

      if (items.length > 0) {
        e.preventDefault()
        menu.open(e, items, {
          targetType: target.type,
          data: target as unknown as Record<string, unknown>,
        })
      }
    },
    [menu, navigate, openModal],
  )

  useEffect(() => {
    window.addEventListener('contextmenu', handleContextMenu)
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [handleContextMenu])

  return null
}
