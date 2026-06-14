import { ArrowLeft } from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import { DkButton } from "@dk-ui/atoms/button"

export function BackButton() {
  const router = useRouter()
  const canGoBack = typeof window !== "undefined" && window.history.length > 1

  if (!canGoBack) return null

  return (
    <DkButton
      variant="ghost"
      size="sm"
      onClick={() => router.history.back()}
      className="w-8 h-8 rounded-full p-0 flex items-center justify-center"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
    </DkButton>
  )
}
