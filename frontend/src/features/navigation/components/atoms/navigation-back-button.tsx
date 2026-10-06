import { ArrowLeft } from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import { DkButton } from "@ui/atoms/button"

/** Atom button to navigate back in browser history, falling back to home when there's no prior entry (e.g. the page was deep-linked). */
export const BackButton = () => {
  const router = useRouter()

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back()
    } else {
      router.navigate({ to: "/" })
    }
  }

  return (
    <DkButton
      variant="ghost"
      size="sm"
      onClick={handleBack}
      className="w-8 h-8 rounded-full p-0 flex items-center justify-center"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
    </DkButton>
  )
};
