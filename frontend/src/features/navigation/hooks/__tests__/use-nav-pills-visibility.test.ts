import { describe, it, expect } from "vitest"
import { computePillsVisibility } from "../use-nav-pills-visibility"

describe("computePillsVisibility", () => {
  it("defaults to showing both left and right pills on standard routes", () => {
    const { showLeft, showRight } = computePillsVisibility("/", null)
    expect(showLeft).toBe(true)
    expect(showRight).toBe(true)
  })

  it("shows both pills on launcher by default when VITE_LAUNCHER_CLEAR_NAV_PILLS is false", () => {
    const { showLeft, showRight } = computePillsVisibility("/launcher", null)
    expect(showLeft).toBe(true)
    expect(showRight).toBe(true)
  })

  it("respects component override to hide pills", () => {
    const { showLeft, showRight } = computePillsVisibility("/", { hidden: true })
    expect(showLeft).toBe(false)
    expect(showRight).toBe(false)
  })

  it("respects granular left or right override", () => {
    const res1 = computePillsVisibility("/", { hideLeft: true })
    expect(res1.showLeft).toBe(false)
    expect(res1.showRight).toBe(true)

    const res2 = computePillsVisibility("/", { hideRight: true })
    expect(res2.showLeft).toBe(true)
    expect(res2.showRight).toBe(false)
  })
})
