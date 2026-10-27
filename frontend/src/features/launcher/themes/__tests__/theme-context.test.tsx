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

  it("changes theme and persists to localStorage", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })

    act(() => {
      result.current.setTheme("steam")
    })

    expect(result.current.currentTheme).toBe("steam")
    expect(result.current.themeMeta.name).toBe("Deck")
    expect(localStorage.getItem("otix:launcher-theme")).toBe("steam")
  })

  it("cycles through available themes sequentially", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })

    expect(result.current.currentTheme).toBe("modern")

    act(() => {
      result.current.cycleTheme()
    })
    expect(result.current.currentTheme).toBe("steam")

    act(() => {
      result.current.cycleTheme()
    })
    expect(result.current.currentTheme).toBe("playstation")
  })

  it("provides full list of 10 available themes", () => {
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
  })
})
