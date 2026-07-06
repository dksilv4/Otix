import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { usePopularGames } from '@/features/launcher/data/queries'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'

export function LauncherSlidePicker() {
  const { data: popularGames = [] } = usePopularGames()
  const { settings } = useLauncherSettings()
  const navigate = useNavigate()

  useEffect(() => {
    if (settings.defaultPage === 'library') {
      navigate({ to: '/launcher/library', replace: true })
    } else if (popularGames.length > 0) {
      navigate({ to: '/launcher/$gameId', params: { gameId: popularGames[0].id }, replace: true })
    }
  }, [popularGames, navigate, settings.defaultPage])

  return null
}
