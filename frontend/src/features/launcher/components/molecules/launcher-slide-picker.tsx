import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useLauncherVisibleGames } from '@/features/launcher/data/game-queries'
import { usePopularGames } from '@/features/launcher/data/queries'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'

export const LauncherSlidePicker = () => {
  const { data: visibleGames = [] } = useLauncherVisibleGames()
  const { data: popularGames = [] } = usePopularGames()
  const { settings } = useLauncherSettings()
  const navigate = useNavigate()

  useEffect(() => {
    if (settings.defaultPage === 'library') {
      navigate({ to: '/launcher/library', replace: true })
    } else if (visibleGames.length > 0) {
      navigate({ to: '/launcher/$gameId', params: { gameId: visibleGames[0].id }, replace: true })
    } else if (popularGames.length > 0) {
      navigate({ to: '/launcher/$gameId', params: { gameId: popularGames[0].id }, replace: true })
    }
  }, [visibleGames, popularGames, navigate, settings.defaultPage])

  return null
};
