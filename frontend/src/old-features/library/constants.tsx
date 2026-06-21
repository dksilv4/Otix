import { BookmarkIcon, HeartIcon, CheckCircle2Icon, Gamepad2Icon, MusicIcon } from "lucide-react"
import type { LibraryTab } from "./library-queries"

export const CORE_TABS: Array<{ id: LibraryTab; icon: React.ReactNode }> = [
  { id: "watchlist", icon: <BookmarkIcon className="h-4 w-4" /> },
  { id: "like", icon: <HeartIcon className="h-4 w-4" /> },
  { id: "watched", icon: <CheckCircle2Icon className="h-4 w-4" /> },
  { id: "played", icon: <Gamepad2Icon className="h-4 w-4" /> },
  { id: "listened", icon: <MusicIcon className="h-4 w-4" /> },
  { id: "owned", icon: <CheckCircle2Icon className="h-4 w-4" /> },
]
