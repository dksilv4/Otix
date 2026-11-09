import { useState, useEffect, useRef, useCallback } from 'react'
import { usePlayer } from '@/lib/player/use-player'
import { extractFilesFromDataTransfer } from '../utils/drop-extractor'
import { handleDroppedMusic } from '../utils/drop-music-handler'

export const useGlobalFileDrop = () => {
  const { playLocalTracks } = usePlayer()
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const dragCounterRef = useRef(0)

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return

    dragCounterRef.current++
    if (dragCounterRef.current === 1) {
      setIsDraggingOver(true)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
      e.dataTransfer.dropEffect = 'copy'
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return

    dragCounterRef.current--
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0
      setIsDraggingOver(false)
    }
  }, [])

  const cancelDrop = useCallback(() => {
    dragCounterRef.current = 0
    setIsDraggingOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      dragCounterRef.current = 0
      setIsDraggingOver(false)

      if (!e.dataTransfer) return

      setIsProcessing(true)
      setProgress(null)

      try {
        const extracted = await extractFilesFromDataTransfer(e.dataTransfer)
        if (extracted.length > 0) {
          await handleDroppedMusic(extracted, playLocalTracks, {
            onProgress: (current, total) => {
              setProgress({ current, total })
            },
          })
        }
      } catch (err) {
        console.warn('[useGlobalFileDrop] Error handling dropped files:', err)
      } finally {
        setIsProcessing(false)
        setProgress(null)
      }
    },
    [playLocalTracks],
  )

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      dragCounterRef.current = 0
      setIsDraggingOver(false)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleDragEnter, handleDragOver, handleDragLeave, handleDrop, handleKeyDown])

  return {
    isDraggingOver,
    isProcessing,
    progress,
    cancelDrop,
  }
}
