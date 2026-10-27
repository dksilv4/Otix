import { describe, it, expect, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { LauncherThemeProvider, useLauncherTheme } from "../theme-context"

describe("LauncherThemeProvider & useLauncherTheme", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("defaults to modern theme", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })
    expect(result.current.currentTheme).toBe("modern")
    expect(result.current.themeMeta.id).toBe("modern")
  })

  it("only allows selecting enabled themes and rejects disabled themes", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })

    // "steam" is currently disabled per active theme focus
    act(() => {
      result.current.setTheme("steam")
    })

    expect(result.current.currentTheme).toBe("modern")
    expect(result.current.themeMeta.id).toBe("modern")
    expect(localStorage.getItem("otix:launcher-theme")).toBe("modern")

    // Selecting "modern" succeeds
    act(() => {
      result.current.setTheme("modern")
    })
    expect(result.current.currentTheme).toBe("modern")
  })

  it("cycles only through enabled themes", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })

    expect(result.current.currentTheme).toBe("modern")

    act(() => {
      result.current.cycleTheme()
    })
    expect(result.current.currentTheme).toBe("modern")
  })

  it("provides full list of 10 available themes with isEnabled flags", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })

    expect(result.current.availableThemes).toHaveLength(10)
    expect(result.current.availableThemes.map((t) => t.id)).toEqual([
      "classic",
      "modern",
      "steam",
      "playstation",
      "xbox",
      "switch",
      "retro",
      "minimal",
      "forge",
      "glass",
    ])

    const modernTheme = result.current.availableThemes.find((t) => t.id === "modern")
    expect(modernTheme?.isEnabled).toBe(true)

    const disabledThemes = result.current.availableThemes.filter((t) => t.id !== "modern")
    expect(disabledThemes.every((t) => t.isEnabled === false)).toBe(true)
  })
})
