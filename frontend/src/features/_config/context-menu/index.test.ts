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
