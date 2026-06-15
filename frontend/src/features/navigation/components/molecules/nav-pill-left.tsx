import {Link, useLocation} from "@tanstack/react-router"
import {DkLogo} from "@dk-ui/atoms/logo"
import {usePageMeta} from "@/lib/providers/page-context"
import {useDesktopPlatform} from "@/lib/desktop/platform"
import {cn} from "@/lib/utils"
import {NavPill} from "../atoms/nav-pill"
import {BackButton} from "../atoms/nav-back-button"
import {MenuToggle} from "../atoms/nav-menu-toggle"

/** Left-side floating navigation pill with back button, menu toggle, and optional logo. */
export function NavPillLeft() {
    const {navLogo} = usePageMeta()
    const location = useLocation()
    const {isDesktop} = useDesktopPlatform()

    const titleBarOffset = isDesktop ? "top-12" : "top-4"
    const isHomePage = location.pathname === "/"
    const canGoBack = typeof window !== "undefined" && window.history.length > 1
    const showBackButton = !isHomePage && canGoBack

    return (
        <NavPill className={cn("left-3 px-2 py-1.5", titleBarOffset, navLogo && "pr-4")} data-menu-trigger>
            {showBackButton && <BackButton/>}
            <MenuToggle/>
            {
                navLogo &&
                <img src={navLogo} alt="" className="h-7 object-contain max-w-[120px]"/>
            }
            {
                !navLogo &&
                <Link to="/" className="flex items-center pr-2">
                    <DkLogo/>
                </Link>
            }

        </NavPill>
    )
}
