import { Menu, ChevronUp } from "lucide-react"
import { DkButton } from "@ui/atoms/button"
import { useNavigation } from "@navigation/hooks/use-navigation"

/** Atom toggle button for the sidebar navigation menu. */
export const MenuToggle = () => {
  const { isOpen, toggle } = useNavigation()

  return (
    <DkButton
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="w-8 h-8 rounded-full p-0 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-[0.94] transition-[transform,background-color,color] duration-100 ease-out cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none"
      aria-label={isOpen ? "Collapse menu" : "Toggle menu"}
      title={isOpen ? "Collapse menu" : "Open menu"}
    >
      {isOpen ? <ChevronUp className="h-4 w-4" /> : <Menu className="h-5 w-5" />}
    </DkButton>
  )
};
