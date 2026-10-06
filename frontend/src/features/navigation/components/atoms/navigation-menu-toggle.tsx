import { Menu } from "lucide-react"
import { DkButton } from "@ui/atoms/button"
import { useNavigation } from "@navigation/hooks/use-navigation"

/** Atom toggle button for the sidebar navigation menu. */
export const MenuToggle = () => {
  const { toggle } = useNavigation()

  return (
    <DkButton
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="w-8 h-8 rounded-full p-0 flex items-center justify-center"
      aria-label="Toggle menu"
    >
      <Menu className="h-5 w-5" />
    </DkButton>
  )
};
