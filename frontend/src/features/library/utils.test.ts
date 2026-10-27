import { describe, it, expect, beforeEach } from "vitest"
import {
  TAB_ORDER_KEY,
  VISIBILITY_KEY,
  readTabOrder,
  writeTabOrder,
  readVisibility,
  writeVisibility,
  sortTabsByOrder,
  resetTabPreferences,
  formatDaysAgo,
  formatPlaytime,
} from "./utils"

describe("library/utils - tab ordering and visibility persistence", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("reads null tab order when nothing is stored", () => {
    expect(readTabOrder()).toBeNull()
  })

  it("writes and reads tab order from localStorage", () => {
    const order = ["watchlist", "games", "overview", "like"]
    writeTabOrder(order)
    expect(localStorage.getItem(TAB_ORDER_KEY)).toBe(JSON.stringify(order))
    expect(readTabOrder()).toEqual(order)
  })

  it("handles corrupted JSON gracefully in readTabOrder", () => {
    localStorage.setItem(TAB_ORDER_KEY, "invalid-json{{")
    expect(readTabOrder()).toBeNull()
  })

  it("reads and writes visibility correctly", () => {
    expect(readVisibility()).toBeNull()
    const visible = ["overview", "watchlist", "like"]
    writeVisibility(visible)
    expect(localStorage.getItem(VISIBILITY_KEY)).toBe(JSON.stringify(visible))
    expect(readVisibility()).toEqual(visible)
  })

  it("sorts tabs according to stored order", () => {
    const tabs = [
      { id: "overview", label: "Overview" },
      { id: "games", label: "Games" },
      { id: "watchlist", label: "Watchlist" },
      { id: "like", label: "Liked" },
    ]

    const order = ["like", "watchlist", "games", "overview"]
    const sorted = sortTabsByOrder(tabs, order)
    expect(sorted.map((t) => t.id)).toEqual(["like", "watchlist", "games", "overview"])
  })

  it("appends unordered tabs at the end while preserving order of ordered tabs", () => {
    const tabs = [
      { id: "overview", label: "Overview" },
      { id: "games", label: "Games" },
      { id: "watchlist", label: "Watchlist" },
      { id: "new-tab", label: "New Tab" },
    ]

    const order = ["games", "overview"]
    const sorted = sortTabsByOrder(tabs, order)
    expect(sorted.map((t) => t.id)).toEqual(["games", "overview", "watchlist", "new-tab"])
  })

  it("returns original tabs when order is null or empty", () => {
    const tabs = [{ id: "a" }, { id: "b" }]
    expect(sortTabsByOrder(tabs, null)).toEqual(tabs)
    expect(sortTabsByOrder(tabs, [])).toEqual(tabs)
  })

  it("resets preferences cleanly via resetTabPreferences", () => {
    writeTabOrder(["a", "b"])
    writeVisibility(["a"])
    expect(readTabOrder()).not.toBeNull()
    expect(readVisibility()).not.toBeNull()

    resetTabPreferences()
    expect(readTabOrder()).toBeNull()
    expect(readVisibility()).toBeNull()
  })

  it("formats days ago and playtime correctly", () => {
    expect(formatDaysAgo(Math.floor(Date.now() / 1000))).toBe("Today")
    expect(formatPlaytime(45)).toBe("45m")
    expect(formatPlaytime(120)).toBe("2h")
  })
})
