import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "@/lib/providers/auth"
import { PlexTabContent } from "../platforms/plex"

export const LibraryIntegrationPlexSection = () => {
  const navigate = useNavigate()
  const { user, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (!user?.plexId) {
      navigate({ to: "/library/watchlist", replace: true })
    }
  }, [authLoading, user?.plexId, navigate])

  if (authLoading) return <PlexTabContent />
  if (!user?.plexId) return null

  return <PlexTabContent />
};
