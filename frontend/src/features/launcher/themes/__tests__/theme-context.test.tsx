import { describe, it, expect, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { LauncherThemeProvider, useLauncherTheme } from "../theme-context"

describe("LauncherThemeProvider & useLauncherTheme", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("defaults to classic theme", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })
    expect(result.current.currentTheme).toBe("classic")
    expect(result.current.themeMeta.id).toBe("classic")
  })

  it("persists classic theme to localStorage", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })

    act(() => {
      result.current.setTheme("classic")
    })

    expect(result.current.currentTheme).toBe("classic")
    expect(result.current.themeMeta.name).toBe("Classic")
    expect(localStorage.getItem("otix:launcher-theme")).toBe("classic")
  })

  it("rejects disabled themes during development and stays on classic", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })

    act(() => {
      result.current.setTheme("steam")
    })

    expect(result.current.currentTheme).toBe("classic")
    expect(result.current.themeMeta.id).toBe("classic")
    expect(localStorage.getItem("otix:launcher-theme")).toBeNull()
  })

  it("cycleTheme remains on classic when other themes are disabled", () => {
    const { result } = renderHook(() => useLauncherTheme(), {
      wrapper: LauncherThemeProvider,
    })

    expect(result.current.currentTheme).toBe("classic")

    act(() => {
      result.current.cycleTheme()
    })
    expect(result.current.currentTheme).toBe("classic")
  })

  it("provides full list of 10 launcher themes with classic enabled and others disabled", () => {
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
    const classicMeta = result.current.availableThemes.find((t) => t.id === "classic")
    expect(classicMeta?.isEnabled).toBe(true)

    const disabledThemes = result.current.availableThemes.filter((t) => t.id !== "classic")
    expect(disabledThemes.every((t) => t.isEnabled === false)).toBe(true)
  })
})
