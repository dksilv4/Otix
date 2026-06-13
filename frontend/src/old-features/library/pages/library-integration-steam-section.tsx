import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "@/lib/auth"
import { getPlatform } from "../platforms"

export function LibraryIntegrationSteamSection() {
  const navigate = useNavigate()
  const { user, isLoading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading) return
    if (!user?.steamId) {
      navigate({ to: "/library/watchlist", replace: true })
    }
  }, [authLoading, user?.steamId, navigate])

  if (authLoading) return null
  if (!user?.steamId) return null

  const platformDef = getPlatform("steam")
  if (!platformDef) return null
  const PlatformContent = platformDef.Content
  return <PlatformContent />
}
