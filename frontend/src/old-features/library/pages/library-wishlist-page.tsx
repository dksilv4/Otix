import { useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useAuth } from "@/lib/auth"
import { WishlistTabContent } from "../molecules/wishlist-tab-content"

export function LibraryWishlistPage() {
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

  return <WishlistTabContent />
}
