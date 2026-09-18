import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "@/lib/providers/auth"
import { YoutubeTabContent } from "../platforms/youtube"

export function LibraryIntegrationYoutubeSection() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (!user?.googleId) {
      navigate({ to: "/library/watchlist", replace: true })
    }
  }, [authLoading, user?.googleId, navigate])

  if (authLoading) return <YoutubeTabContent />
  if (!user?.googleId) return null

  return <YoutubeTabContent />
}
