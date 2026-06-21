import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { usePopularGames } from '@/features/launcher/queries'

export function LauncherSlidePicker() {
  const { data: popularGames = [] } = usePopularGames()
  const navigate = useNavigate()

  useEffect(() => {
    if (popularGames.length > 0) {
      navigate({ to: '/launcher/$gameId', params: { gameId: popularGames[0].id }, replace: true })
    }
  }, [popularGames, navigate])

  return null
}
