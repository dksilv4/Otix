import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  NodeMapEdge,
  NodeMapItem,
  NodeMapPosition,
  NodeMapViewport,
} from '../types/node-map'
import {
  calculateAutoLayout,
  loadStoredPositions,
  saveStoredPositions,
  NODE_CARD_WIDTH,
  NODE_CARD_HEIGHT,
} from '../utils/node-map'

interface UseNodeMapProps {
  items: NodeMapItem[]
  edges: NodeMapEdge[]
  anchor?: { x: number; y: number }
}

export const useNodeMap = ({ items, anchor }: UseNodeMapProps) => {
  const [positions, setPositions] = useState<Record<string, NodeMapPosition>>({})
  const [viewport, setViewport] = useState<NodeMapViewport>({ x: 0, y: 0, zoom: 1 })
  const [selectedItem, setSelectedItem] = useState<NodeMapItem | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  const [connectingFrom, setConnectingFrom] = useState<NodeMapItem | null>(null)
  const [connectingMousePos, setConnectingMousePos] = useState<{ x: number; y: number } | null>(null)

  const positionsRef = useRef(positions)
  useEffect(() => {
    positionsRef.current = positions
  }, [positions])

  // Initial layout calculation / restore
  useEffect(() => {
    if (items.length === 0) return

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

  // Zoom helpers
  const zoomIn = useCallback(() => {
    setViewport((prev) => ({ ...prev, zoom: Math.min(prev.zoom + 0.15, 2) }))
  }, [])

  const zoomOut = useCallback(() => {
    setViewport((prev) => ({ ...prev, zoom: Math.max(prev.zoom - 0.15, 0.4) }))
  }, [])

  const resetView = useCallback(() => {
    setViewport({ x: 0, y: 0, zoom: 1 })
  }, [])

  // Canvas Panning handlers
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    // Only left click on canvas background
    if (e.button !== 0) return
    setIsPanning(true)
    setPanStart({ x: e.clientX - viewport.x, y: e.clientY - viewport.y })
  }, [viewport.x, viewport.y])

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (isPanning) {
      setViewport((prev) => ({
        ...prev,
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      }))
    } else if (draggingItemId) {
      const currentPos = positionsRef.current[draggingItemId] || { x: 0, y: 0 }
      const newX = Math.max(0, (e.clientX - viewport.x) / viewport.zoom - dragOffset.x)
      const newY = Math.max(0, (e.clientY - viewport.y) / viewport.zoom - dragOffset.y)

      if (Math.abs(newX - currentPos.x) > 1 || Math.abs(newY - currentPos.y) > 1) {
        setPositions((prev) => ({
          ...prev,
          [draggingItemId]: { x: Math.round(newX), y: Math.round(newY) },
        }))
      }
    }

    if (connectingFrom) {
      setConnectingMousePos({
        x: (e.clientX - viewport.x) / viewport.zoom,
        y: (e.clientY - viewport.y) / viewport.zoom,
      })
    }
  }, [isPanning, panStart, draggingItemId, dragOffset, viewport, connectingFrom])

  const handleCanvasPointerUp = useCallback(() => {
    if (isPanning) {
      setIsPanning(false)
    }
    if (draggingItemId) {
      setDraggingItemId(null)
      saveStoredPositions(positionsRef.current)
    }
    if (connectingFrom && !connectingMousePos) {
      setConnectingFrom(null)
    }
  }, [isPanning, draggingItemId, connectingFrom, connectingMousePos])

  // Node Dragging handlers
  const handleNodeDragStart = useCallback((e: React.PointerEvent, itemId: string) => {
    e.stopPropagation()
    const pos = positionsRef.current[itemId] || { x: 0, y: 0 }
    const canvasMouseX = (e.clientX - viewport.x) / viewport.zoom
    const canvasMouseY = (e.clientY - viewport.y) / viewport.zoom

    setDraggingItemId(itemId)
    setDragOffset({
      x: canvasMouseX - pos.x,
      y: canvasMouseY - pos.y,
    })
  }, [viewport])

  // Connection Dragging
  const handleStartConnecting = useCallback((e: React.MouseEvent | React.PointerEvent, item: NodeMapItem) => {
    e.stopPropagation()
    const pos = positionsRef.current[item.id] || { x: 100, y: 100 }
    setConnectingFrom(item)
    setConnectingMousePos({
      x: pos.x + NODE_CARD_WIDTH,
      y: pos.y + NODE_CARD_HEIGHT / 2,
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

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY < 0 ? 0.08 : -0.08
      setViewport((prev) => ({
        ...prev,
        zoom: Math.min(Math.max(prev.zoom + delta, 0.4), 2),
      }))
    }
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
    connectingFrom,
    connectingMousePos,
    handleAutoLayout,
    zoomIn,
    zoomOut,
    resetView,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleNodeDragStart,
    handleStartConnecting,
    handleCancelConnecting,
    handleWheel,
  }
}
