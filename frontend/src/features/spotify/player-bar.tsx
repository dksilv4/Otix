import { useEffect, useRef, useState } from 'react'
import { usePlayer } from './use-player'
import { PlayerBarContent } from './player-bar-content'

// ── Floating player position / drag ──

export type PlayerPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

const PLAYER_POSITION_STORAGE_KEY = 'otix_player_position_v2'

function loadPlayerPosition(): PlayerPosition {
  try {
    const raw = localStorage.getItem(PLAYER_POSITION_STORAGE_KEY)
    if (!raw) return 'bottom-center'
    const valid = [
      'top-left', 'top-center', 'top-right',
      'middle-left', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right',
    ]
    return valid.includes(raw) ? raw as PlayerPosition : 'bottom-center'
  } catch {
    return 'bottom-center'
  }
}

function savePlayerPosition(position: PlayerPosition) {
  try {
    localStorage.setItem(PLAYER_POSITION_STORAGE_KEY, position)
  } catch {
    // localStorage not available
  }
}

function canDragPlayer(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(min-width: 768px) and (pointer: fine)').matches
}

interface DragState {
  x: number
  y: number
  width: number
  height: number
  offsetX: number
  offsetY: number
}

const SNAP_POINTS: Record<PlayerPosition, { x: number; y: number }> = {
  'top-left': { x: 0, y: 0 },
  'top-center': { x: 0.5, y: 0 },
  'top-right': { x: 1, y: 0 },
  'middle-left': { x: 0, y: 0.5 },
  'middle-right': { x: 1, y: 0.5 },
  'bottom-left': { x: 0, y: 1 },
  'bottom-center': { x: 0.5, y: 1 },
  'bottom-right': { x: 1, y: 1 },
}

function nearestSnapPosition(centerX: number, centerY: number, width: number, height: number): PlayerPosition {
  const margin = 16
  const maxX = window.innerWidth - width
  const maxY = window.innerHeight - height
  const normX = maxX > 0 ? (centerX - margin) / (maxX - margin) : 0.5
  const normY = maxY > 0 ? (centerY - margin) / (maxY - margin) : 0.5

  let best: PlayerPosition = 'bottom-center'
  let bestDist = Infinity
  for (const [pos, point] of Object.entries(SNAP_POINTS)) {
    const dx = normX - point.x
    const dy = normY - point.y
    const dist = dx * dx + dy * dy
    if (dist < bestDist) {
      bestDist = dist
      best = pos as PlayerPosition
    }
  }
  return best
}

function positionToStyle(pos: PlayerPosition, width: number, _height: number): React.CSSProperties {
  const margin = 16
  const point = SNAP_POINTS[pos]

  const style: React.CSSProperties = {
    position: 'fixed',
    width: `${width}px`,
    margin: 0,
  }

  if (point.x === 0) {
    style.left = `${margin}px`
  } else if (point.x === 1) {
    style.right = `${margin}px`
  } else {
    style.left = '50%'
    style.transform = 'translateX(-50%)'
  }

  if (point.y === 0) {
    style.top = `${margin}px`
  } else if (point.y === 1) {
    style.bottom = `${margin}px`
  } else {
    style.top = '50%'
    style.transform = (style.transform ? `${style.transform} ` : '') + 'translateY(-50%)'
  }

  return style
}

// ── Floating player bar ──

export function PlayerBar({ isPinned, onPin, onUnpin }: {
  isPinned: boolean
  onPin?: () => void
  onUnpin?: () => void
}) {
  const { source, currentTrack } = usePlayer()
  const [playerPosition, setPlayerPosition] = useState<PlayerPosition>(() => loadPlayerPosition())
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null)
  const playerRef = useRef<HTMLDivElement>(null)

  const isDraggingPlayer = dragState != null
  const dismissed = dismissedKey === currentTrack?.id

  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const handleResize = () => {
      if (!isDraggingPlayer) {
        forceUpdate((n) => n + 1)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isDraggingPlayer])

  // Reset dismissed state when track changes
  useEffect(() => {
    if (currentTrack?.id && dismissedKey && dismissedKey !== currentTrack.id) {
      setDismissedKey(null)
    }
  }, [currentTrack?.id, dismissedKey])

  if (source === 'none' || !currentTrack || dismissed) return null

  const startPlayerDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!canDragPlayer() || e.button !== 0) return

    const rect = playerRef.current?.getBoundingClientRect()
    if (!rect) return
    setDragState({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    })
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }

  const updatePlayerDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return
    const margin = 16
    const maxX = Math.max(margin, window.innerWidth - dragState.width - margin)
    const maxY = Math.max(margin, window.innerHeight - dragState.height - margin)
    setDragState({
      ...dragState,
      x: Math.min(maxX, Math.max(margin, e.clientX - dragState.offsetX)),
      y: Math.min(maxY, Math.max(margin, e.clientY - dragState.offsetY)),
    })
  }

  const finishPlayerDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState) return
    const centerX = dragState.x + dragState.width / 2
    const centerY = dragState.y + dragState.height / 2
    const snapPosition = nearestSnapPosition(centerX, centerY, dragState.width, dragState.height)
    setPlayerPosition(snapPosition)
    savePlayerPosition(snapPosition)
    setDragState(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const dragPointerHandlers = {
    onPointerDown: startPlayerDrag,
    onPointerMove: updatePlayerDrag,
    onPointerUp: finishPlayerDrag,
    onPointerCancel: finishPlayerDrag,
  }

  const containerStyle: React.CSSProperties = dragState
    ? {
        position: 'fixed',
        left: `${dragState.x}px`,
        top: `${dragState.y}px`,
        width: `${dragState.width}px`,
        zIndex: 50,
      }
    : {
        ...positionToStyle(playerPosition, 512, 0),
        zIndex: 50,
      }

  return (
    <div
      ref={playerRef}
      className="w-[calc(100%-16px)] max-w-lg select-none"
      style={containerStyle}
    >
      <PlayerBarContent
        showDragHandle={isPinned}
        showPinButton
        pinLabel={isPinned ? 'Unpin player' : 'Pin player'}
        onPin={isPinned ? onUnpin : onPin}
        onDismiss={() => setDismissedKey(currentTrack?.id ?? null)}
        queuePlacement="above"
        dragPointerHandlers={isPinned ? dragPointerHandlers : undefined}
        isDragging={isDraggingPlayer}
      />
    </div>
  )
}
