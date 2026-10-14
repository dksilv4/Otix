import { useState, useCallback } from 'react'
import { getDesktopAPI, hasDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@ui/molecules/toast'
import type { LocalGame } from '@/features/launcher/types'

interface DisambiguationState {
  open: boolean
  game: LocalGame | null
  candidates: string[]
}

export const useLaunchGame = () => {
  const { toast } = useToast()
  const [disambiguationState, setDisambiguationState] = useState<DisambiguationState>({
    open: false,
    game: null,
    candidates: [],
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const launch = useCallback(async (game: LocalGame) => {
    if (!hasDesktopAPI()) {
      toast({
        title: 'Desktop Client Required',
        description: 'Launching games requires the Otix Desktop application.',
      })
      return
    }

    const api = getDesktopAPI()
    if (!api?.launchGame) return

    try {
      // Check for ambiguous candidates if available
      if (api.getAmbiguousCandidates) {
        const candidates = await api.getAmbiguousCandidates(game)
        if (Array.isArray(candidates) && candidates.length > 1) {
          setDisambiguationState({
            open: true,
            game,
            candidates,
          })
          return
        }
      }

      await api.launchGame(game)
    } catch (err: any) {
      console.error('[useLaunchGame] Failed to launch game:', err)
      toast({
        title: 'Launch Failed',
        description: err.message || 'Could not launch game.',
        variant: 'destructive',
      })
    }
  }, [toast])

  const handleSelectPlatform = useCallback(async (platform: string) => {
    const { game } = disambiguationState
    if (!game) return

    const api = getDesktopAPI()
    setIsSubmitting(true)

    try {
      if (api?.setGamePlatform) {
        await api.setGamePlatform(game.id, platform)
      }

      const updatedGame: LocalGame = {
        ...game,
        platform: platform as any,
      }

      setDisambiguationState({ open: false, game: null, candidates: [] })
      if (api?.launchGame) {
        await api.launchGame(updatedGame)
      }
    } catch (err: any) {
      console.error('[useLaunchGame] Failed to launch after platform selection:', err)
      toast({
        title: 'Launch Failed',
        description: err.message || 'Could not launch game.',
        variant: 'destructive',
      })
    } finally {
      setIsSubmitting(false)
    }
  }, [disambiguationState, toast])

  const handleCloseModal = useCallback(() => {
    setDisambiguationState({ open: false, game: null, candidates: [] })
  }, [])

  return {
    launchGame: launch,
    disambiguationModalProps: {
      open: disambiguationState.open,
      onOpenChange: (open: boolean) => {
        if (!open) handleCloseModal()
      },
      game: disambiguationState.game!,
      candidatePlatforms: disambiguationState.candidates,
      onSelectPlatform: handleSelectPlatform,
      isSubmitting,
    },
    hasDisambiguationTarget: disambiguationState.open && disambiguationState.game != null,
  }
}
