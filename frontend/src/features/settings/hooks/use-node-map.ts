import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  NodeMapEdge,
  NodeMapItem,
  NodeMapPosition,
  NodeMapViewport,
} from '../types/node-map'
import {
  calculateAutoLayout,
  calculateFitViewport,
  calculateZoomAtPoint,
  calculateWheelZoomDelta,
  loadStoredPositions,
  saveStoredPositions,
  getNodeCardWidth,
  getNodeCardHeight,
  NODE_CARD_WIDTH,
  NODE_CARD_HEIGHT,
  HUB_NODE_ID,
  HUB_NODE_WIDTH,
} from '../utils/node-map'

interface UseNodeMapProps {
  items: NodeMapItem[]
  edges: NodeMapEdge[]
  anchor?: { x: number; y: number }
  onCardDropConnect?: (sourceItem: NodeMapItem, targetItem: NodeMapItem) => void
}

export const useNodeMap = ({ items, anchor, onCardDropConnect }: UseNodeMapProps) => {
  const [positions, setPositions] = useState<Record<string, NodeMapPosition>>({})
  const [viewport, setViewport] = useState<NodeMapViewport>({ x: 0, y: 0, zoom: 1 })
  const [selectedItem, setSelectedItem] = useState<NodeMapItem | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)

  const [connectingFrom, setConnectingFrom] = useState<NodeMapItem | null>(null)
  const [connectingMousePos, setConnectingMousePos] = useState<{ x: number; y: number } | null>(null)

  const positionsRef = useRef(positions)
  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  // Initial layout calculation / restore
  useEffect(() => {
    const stored = loadStoredPositions()
    const auto = calculateAutoLayout(items, anchor)
    const merged: Record<string, NodeMapPosition> = {}

    for (const item of items) {
      if (stored[item.id]) {
        merged[item.id] = stored[item.id]
      } else if (auto[item.id]) {
        merged[item.id] = auto[item.id]
      } else {
        merged[item.id] = { x: anchor?.x ?? 340, y: anchor?.y ?? 240 }
      }
    }

    if (stored[HUB_NODE_ID]) {
      merged[HUB_NODE_ID] = stored[HUB_NODE_ID]
    } else if (auto[HUB_NODE_ID]) {
      merged[HUB_NODE_ID] = auto[HUB_NODE_ID]
    } else {
      const windowW = typeof window !== 'undefined' ? window.innerWidth : 1200
      merged[HUB_NODE_ID] = {
        x: Math.round((windowW - HUB_NODE_WIDTH) / 2),
        y: anchor?.y ?? 100,
      }
    }

    setPositions(merged)
  }, [items, anchor])

  const handleAutoLayout = useCallback(() => {
    try {
      localStorage.removeItem('otix_node_map_positions_v1')
    } catch {
      // ignore
    }
    const layout = calculateAutoLayout(items, anchor)
    setPositions(layout)
    setViewport({ x: 0, y: 0, zoom: 1 })
  }, [items, anchor])

  // Zoom helpers with zoom-at-center
  const zoomIn = useCallback((centerX?: number, centerY?: number) => {
    const cx = centerX ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 600)
    const cy = centerY ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 400)
    setViewport((prev) => calculateZoomAtPoint(prev, prev.zoom + 0.15, cx, cy))
  }, [])

  const zoomOut = useCallback((centerX?: number, centerY?: number) => {
    const cx = centerX ?? (typeof window !== 'undefined' ? window.innerWidth / 2 : 600)
    const cy = centerY ?? (typeof window !== 'undefined' ? window.innerHeight / 2 : 400)
    setViewport((prev) => calculateZoomAtPoint(prev, prev.zoom - 0.15, cx, cy))
  }, [])

  const resetView = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 })
  }, [])

  const fitView = useCallback((containerWidth?: number, containerHeight?: number) => {
    const w = containerWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 1200)
    const h = containerHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 800)
    const nextVp = calculateFitViewport(items, positionsRef.current, w, h)
    setViewport(nextVp)
  }, [items])

  // Canvas Panning handlers
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    // Only left click on canvas background
    if (e.button !== 0) return
    if (connectingFrom) {
      setConnectingFrom(null)
      setConnectingMousePos(null)
      return
    }
    setSelectedItem(null)
    setIsPanning(true)
    setPanStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y })
  }, [viewport.x, viewport.y, connectingFrom])

  const [hoveredDropTargetId, setHoveredDropTargetId] = useState<string | null>(null)
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null)
  const activeDragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning) {
      setViewport((prev) => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }))
    } else if (activeDragRef.current) {
      const { id: itemId, offsetX, offsetY } = activeDragRef.current
      const currentPos = positionsRef.current[itemId] || { x: 0, y: 0 }
      const newX = Math.max(0, (e.clientX - viewport.x) / viewport.zoom - offsetX)
      const newY = Math.max(0, (e.clientY - viewport.y) / viewport.zoom - offsetY)

      const roundX = Math.round(newX)
      const roundY = Math.round(newY)

      if (roundX !== currentPos.x || roundY !== currentPos.y) {
        positionsRef.current[itemId] = { x: roundX, y: roundY }
        setPositions((prev) => ({
          ...prev,
          [itemId]: { x: roundX, y: roundY },
        }))

        // Check if dragged card is overlapping any other node
        let targetId: string | null = null
        if (itemId !== HUB_NODE_ID) {
          for (const item of items) {
            if (item.id === itemId) continue
            const tPos = positionsRef.current[item.id]
            if (!tPos) continue
            const dx = Math.abs(roundX - tPos.x)
            const dy = Math.abs(roundY - tPos.y)
            const targetWidth = getNodeCardWidth(item.type)
            const targetHeight = getNodeCardHeight(item.type)
            if (dx < targetWidth * 0.75 && dy < targetHeight * 0.9) {
              targetId = item.id
              break
            }
          }
        }
        setHoveredDropTargetId(targetId)
      }
    }

    if (connectingFrom) {
      setConnectingMousePos({
        x: (e.clientX - viewport.x) / viewport.zoom,
        y: (e.clientY - viewport.y) / viewport.zoom,
      })
    }
  }, [isPanning, panStart, viewport, connectingFrom, items])

  const handleCanvasPointerUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false)
    }
    const active = activeDragRef.current
    if (active) {
      const activeId = active.id
      activeDragRef.current = null

      if (hoveredDropTargetId && onCardDropConnect) {
        const sourceItem = items.find((i) => i.id === activeId)
        const targetItem = items.find((i) => i.id === hoveredDropTargetId)
        if (sourceItem && targetItem) {
          // Revert position so dragged card doesn't get stuck overlapping target card
          if (dragStartPosRef.current) {
            const revert = dragStartPosRef.current
            positionsRef.current[activeId] = revert
            setPositions((prev) => ({ ...prev, [activeId]: revert }))
          }
          onCardDropConnect(sourceItem, targetItem)
        }
      } else {
        saveStoredPositions(positionsRef.current)
      }
      setDraggingItemId(null)
      setHoveredDropTargetId(null)
      dragStartPosRef.current = null
    }
    if (connectingFrom && !connectingMousePos) {
      setConnectingFrom(null)
    }
  }, [isPanning, hoveredDropTargetId, onCardDropConnect, items, connectingFrom, connectingMousePos])

  // Node Dragging handlers
  const handleNodeDragStart = useCallback((e: React.PointerEvent, itemId: string) => {
    e.stopPropagation()
    const pos = positionsRef.current[itemId] || { x: 0, y: 0 }
    const canvasMouseX = (e.clientX - viewport.x) / viewport.zoom
    const canvasMouseY = (e.clientY - viewport.y) / viewport.zoom

    const offsetX = canvasMouseX - pos.x
    const offsetY = canvasMouseY - pos.y

    activeDragRef.current = { id: itemId, offsetX, offsetY }
    dragStartPosRef.current = { ...pos }
    setDraggingItemId(itemId)
    setHoveredDropTargetId(null)
  }, [viewport])

  // Connection Dragging
  const handleStartConnecting = useCallback((e: React.MouseEvent | React.PointerEvent, item: NodeMapItem) => {
    e.stopPropagation()
    const pos = positionsRef.current[item.id] || { x: 100, y: 100 }
    const itemWidth = getNodeCardWidth(item.type)
    const itemHeight = getNodeCardHeight(item.type)
    setConnectingFrom(item)
    setConnectingMousePos({
      x: pos.x + itemWidth,
      y: pos.y + itemHeight / 2,
    })
  }, [])

  const handleCancelConnecting = useCallback(() => {
    setConnectingFrom(null)
    setConnectingMousePos(null)
  }, [])

  // Cancel connecting on Escape key or right-click anywhere
  useEffect(() => {
    if (!connectingFrom) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancelConnecting()
      }
    }

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      handleCancelConnecting()
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('contextmenu', handleContextMenu, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('contextmenu', handleContextMenu, { capture: true })
    }
  }, [connectingFrom, handleCancelConnecting])

  // Wheel zoom (zoom-at-cursor for discrete wheel & pinch, plus shift/horizontal pan)
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()

    // Handle horizontal scroll panning (trackpad swipe or Shift+wheel)
    if (e.shiftKey) {
      setViewport((prev) => ({
        ...prev,
        x: Math.round(prev.x - e.deltaY),
      }))
      return
    }

    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 2) {
      setViewport((prev) => ({
        ...prev,
        x: Math.round(prev.x - e.deltaX),
      }))
      return
    }

    const container = e.currentTarget.getBoundingClientRect()
    const mouseX = e.clientX - container.left
    const mouseY = e.clientY - container.top

    const isPinchOrCtrl = Boolean(e.ctrlKey || e.metaKey)
    const delta = calculateWheelZoomDelta(e.deltaY, isPinchOrCtrl, e.deltaMode)

    setViewport((prev) => calculateZoomAtPoint(prev, prev.zoom + delta, mouseX, mouseY))
  }, [])

  return {
    positions,
    viewport,
    selectedItem,
    setSelectedItem,
    searchQuery,
    setSearchQuery,
    isPanning,
    draggingItemId,
    hoveredDropTargetId,
    connectingFrom,
    connectingMousePos,
    handleAutoLayout,
    zoomIn,
    zoomOut,
    resetView,
    fitView,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleNodeDragStart,
    handleStartConnecting,
    handleCancelConnecting,
    handleWheel,
  }
}
