import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "@/lib/auth"
import { SpotifyTabContent } from "../platforms/spotify"

export function LibraryIntegrationSpotifySection() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (!user?.spotifyId) {
      navigate({ to: "/library/watchlist", replace: true })
    }
  }, [authLoading, user?.spotifyId, navigate])

  if (authLoading) return null
  if (!user?.spotifyId) return null

  return <SpotifyTabContent />
}
