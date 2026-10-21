import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import { GlobalContextMenuListener } from '../global-context-menu-listener'
import * as contextMenuContext from '../context-menu-context'

// Mock tanstack router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

// Mock modals
vi.mock('@/lib/modals', () => ({
  useModal: () => ({
    openModal: vi.fn(),
    closeModal: vi.fn(),
  }),
}))

describe('GlobalContextMenuListener', () => {
  const mockOpen = vi.fn()
  const mockClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(contextMenuContext, 'useOptionalMenuContext').mockReturnValue({
      isOpen: false,
      position: null,
      items: [],
      mediaType: null,
      targetType: null,
      data: null,
      open: mockOpen,
      close: mockClose,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('opens menu when right-clicking an unhandled element', () => {
    const { container } = render(<GlobalContextMenuListener />)
    const target = document.createElement('div')
    target.setAttribute('data-context-type', 'media')
    target.setAttribute('data-media-id', 'movie-1')
    target.setAttribute('data-media-type', 'movie')
    target.setAttribute('data-media-title', 'Oppenheimer')
    container.appendChild(target)

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 150,
      clientY: 200,
    })

    target.dispatchEvent(event)

    expect(mockOpen).toHaveBeenCalledTimes(1)
    expect(mockOpen).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ id: 'view-details' }),
      ]),
      expect.objectContaining({ targetType: 'media' }),
    )
  })

  it('bypasses custom context menu when Shift key is pressed', () => {
    const { container } = render(<GlobalContextMenuListener />)
    const target = document.createElement('div')
    container.appendChild(target)

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    })

    target.dispatchEvent(event)

    expect(mockOpen).not.toHaveBeenCalled()
  })

  it('does nothing when event is already defaultPrevented by explicit trigger', () => {
    const { container } = render(<GlobalContextMenuListener />)
    const target = document.createElement('div')
    container.appendChild(target)

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    })
    event.preventDefault()

    target.dispatchEvent(event)

    expect(mockOpen).not.toHaveBeenCalled()
  })
})
