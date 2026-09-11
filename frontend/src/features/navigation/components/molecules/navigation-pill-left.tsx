import {Link, useLocation} from "@tanstack/react-router"
import {DkLogo} from "@ui/atoms/logo"
import {usePageMeta} from "@/lib/providers/page-context"
import {useDesktopPlatform} from "@/lib/desktop/platform"
import {NavPill} from "../atoms/navigation-pill"
import {BackButton} from "../atoms/navigation-back-button"
import {MenuToggle} from "../atoms/navigation-menu-toggle"

/** Left-side floating navigation pill with back button, menu toggle, and optional logo. */
export function NavPillLeft() {
    const {navLogo} = usePageMeta()
    const location = useLocation()
    const {isDesktop} = useDesktopPlatform()

    const titleBarOffset = isDesktop ? "top-12" : "top-4"
    const isHomePage = location.pathname === "/"
    const showBackButton = !isHomePage

    return (
        <NavPill className={"left-3 px-2 py-1.5 " + titleBarOffset + (navLogo ? " pr-4" : '')} data-menu-trigger data-nav-pill="left">
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
