import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { cleanup } from "@testing-library/react"
import {
  TAB_ORDER_KEY,
  VISIBILITY_KEY,
  readTabOrder,
  writeTabOrder,
  readVisibility,
  writeVisibility,
  sortTabsByOrder,
  resetTabPreferences,
} from "../utils"

describe("Adversarial Stress Test: Library Tab Customization & LocalStorage Resilience", () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    cleanup()
  })


  describe("Corrupted JSON resilience in readTabOrder() and readVisibility()", () => {
    const corruptedPayloads = [
      "{invalid",
      "{foo: bar}",
      "[unclosed-array",
      "{\"key\": undefined}",
      "{{{{",
      "NaN",
      "undefined",
      "<xml>not json</xml>",
      "",
    ]

    for (const payload of corruptedPayloads) {
      it(`gracefully returns null without throwing for payload: ${JSON.stringify(payload)}`, () => {
        if (payload === "") {
          localStorage.removeItem(TAB_ORDER_KEY)
        } else {
          localStorage.setItem(TAB_ORDER_KEY, payload)
        }
        expect(() => readTabOrder()).not.toThrow()
        expect(readTabOrder()).toBeNull()

        if (payload === "") {
          localStorage.removeItem(VISIBILITY_KEY)
        } else {
          localStorage.setItem(VISIBILITY_KEY, payload)
        }
        expect(() => readVisibility()).not.toThrow()
        expect(readVisibility()).toBeNull()
      })
    }
  })

  describe("Non-array types in localStorage", () => {
    const nonArrayPayloads = [
      { raw: "12345", desc: "primitive number" },
      { raw: "true", desc: "boolean true" },
      { raw: "false", desc: "boolean false" },
      { raw: "\"just-a-string\"", desc: "primitive string" },
      { raw: "{\"overview\": 0, \"games\": 1}", desc: "plain object instead of array" },
      { raw: "null", desc: "JSON null" },
    ]

    for (const { raw, desc } of nonArrayPayloads) {
      it(`gracefully returns null for non-array: ${desc}`, () => {
        localStorage.setItem(TAB_ORDER_KEY, raw)
        expect(() => readTabOrder()).not.toThrow()
        expect(readTabOrder()).toBeNull()

        localStorage.setItem(VISIBILITY_KEY, raw)
        expect(() => readVisibility()).not.toThrow()
        expect(readVisibility()).toBeNull()
      })
    }
  })

  describe("Corrupted arrays, empty arrays, and non-string elements", () => {
    it("returns empty array for empty JSON array '[]'", () => {
      localStorage.setItem(TAB_ORDER_KEY, "[]")
      const result = readTabOrder()
      expect(result).toEqual([])
    })

    it("filters out non-string items (numbers, objects, nulls) from array", () => {
      localStorage.setItem(
        TAB_ORDER_KEY,
        JSON.stringify([123, null, "overview", {}, true, undefined, "games", ["nested"]]),
      )
      const result = readTabOrder()
      expect(result).toEqual(["overview", "games"])
    })

    it("returns empty array when array contains zero valid strings", () => {
      localStorage.setItem(TAB_ORDER_KEY, JSON.stringify([1, 2, 3, null, {}, false]))
      const result = readTabOrder()
      expect(result).toEqual([])
    })

    it("preserves string elements even if they contain weird characters or whitespace", () => {
      const weird = ["overview", "  spaced  ", "", "unicode-🚀", "nested/slash"]
      localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(weird))
      expect(readTabOrder()).toEqual(weird)
    })
  })

  describe("LocalStorage API exceptions (SecurityError, QuotaExceededError)", () => {
    it("handles SecurityError / DOMException when reading localStorage", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("Access denied", "SecurityError")
      })
      expect(() => readTabOrder()).not.toThrow()
      expect(readTabOrder()).toBeNull()
      expect(() => readVisibility()).not.toThrow()
      expect(readVisibility()).toBeNull()
    })

    it("handles QuotaExceededError silently on writeTabOrder and writeVisibility", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError")
      })
      expect(() => writeTabOrder(["overview", "games"])).not.toThrow()
      expect(() => writeVisibility(["overview"])).not.toThrow()
    })

    it("handles errors silently on resetTabPreferences", () => {
      vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new DOMException("Storage disabled", "SecurityError")
      })
      expect(() => resetTabPreferences()).not.toThrow()
    })
  })

  describe("sortTabsByOrder robustness under adversarial inputs", () => {
    const defaultTabs = [
      { id: "overview", label: "Overview" },
      { id: "games", label: "Games" },
      { id: "watchlist", label: "Watchlist" },
      { id: "like", label: "Liked" },
      { id: "lists", label: "Lists" },
    ]

    it("falls back to default tab order when order is null", () => {
      const sorted = sortTabsByOrder(defaultTabs, null)
      expect(sorted.map((t) => t.id)).toEqual(["overview", "games", "watchlist", "like", "lists"])
    })

    it("falls back to default tab order when order is empty array", () => {
      const sorted = sortTabsByOrder(defaultTabs, [])
      expect(sorted.map((t) => t.id)).toEqual(["overview", "games", "watchlist", "like", "lists"])
    })

    it("handles order containing 100% unknown tab IDs without dropping default tabs", () => {
      const unknownOrder = ["deleted-tab", "phantom-tab-123", "plugin:old-removed"]
      const sorted = sortTabsByOrder(defaultTabs, unknownOrder)

      // All default tabs must still exist
      expect(sorted).toHaveLength(defaultTabs.length)
      expect(sorted.map((t) => t.id)).toEqual(["overview", "games", "watchlist", "like", "lists"])
    })

    it("handles order containing partially known and partially unknown tab IDs", () => {
      const mixedOrder = ["unknown-1", "watchlist", "ghost-2", "games"]
      const sorted = sortTabsByOrder(defaultTabs, mixedOrder)

      expect(sorted).toHaveLength(defaultTabs.length)
      // watchlist is index 1, games is index 3
      expect(sorted[0].id).toBe("watchlist")
      expect(sorted[1].id).toBe("games")
      // The remaining tabs (overview, like, lists) fall to the end with fallback priority
      const remainingIds = sorted.slice(2).map((t) => t.id)
      expect(remainingIds).toContain("overview")
      expect(remainingIds).toContain("like")
      expect(remainingIds).toContain("lists")
    })

    it("handles duplicate tab IDs in order without duplicating tabs in the output", () => {
      const duplicateOrder = ["games", "games", "overview", "overview", "games"]
      const sorted = sortTabsByOrder(defaultTabs, duplicateOrder)

      // CRITICAL INVARIANT: Output must NEVER duplicate tabs from defaultTabs
      expect(sorted).toHaveLength(defaultTabs.length)
      const ids = sorted.map((t) => t.id)
      const uniqueIds = Array.from(new Set(ids))
      expect(ids).toEqual(uniqueIds)
    })

    it("does not mutate the original tabs array", () => {
      const copy = [...defaultTabs]
      const order = ["lists", "like"]
      sortTabsByOrder(defaultTabs, order)
      expect(defaultTabs).toEqual(copy)
    })

    it("handles large orders exceeding 1000 items without crashing or throwing", () => {
      const largeOrder = Array.from({ length: 1500 }, (_, i) => `tab-${i}`)
      largeOrder[500] = "games"
      largeOrder[1200] = "overview"

      expect(() => sortTabsByOrder(defaultTabs, largeOrder)).not.toThrow()
      const sorted = sortTabsByOrder(defaultTabs, largeOrder)
      expect(sorted).toHaveLength(defaultTabs.length)
    })
  })

  describe("LibraryTabSettingsModal UI resilience with corrupted state inputs", () => {
    const sampleTabs = [
      { id: "overview", label: "Overview", icon: <span key="1" /> },
      { id: "games", label: "Games", icon: <span key="2" /> },
      { id: "watchlist", label: "Watchlist", icon: <span key="3" /> },
    ]

    it("renders cleanly without errors when currentOrder and currentVisibility are empty arrays", async () => {
      const { LibraryTabSettingsModal } = await import("../molecules/library-tab-settings-modal")
      const { render, screen } = await import("@testing-library/react")

      expect(() =>
        render(
          <LibraryTabSettingsModal
            allTabs={sampleTabs}
            currentOrder={[]}
            currentVisibility={[]}
            onSave={vi.fn()}
            onClose={vi.fn()}
          />,
        ),
      ).not.toThrow()

      expect(screen.getByText("Customize Library Tabs")).toBeInTheDocument()
      expect(screen.getByText("Overview")).toBeInTheDocument()
      expect(screen.getByText("Games")).toBeInTheDocument()
    })

    it("renders cleanly when currentOrder contains non-existent / deleted tab IDs", async () => {
      const { LibraryTabSettingsModal } = await import("../molecules/library-tab-settings-modal")
      const { render, screen } = await import("@testing-library/react")

      expect(() =>
        render(
          <LibraryTabSettingsModal
            allTabs={sampleTabs}
            currentOrder={["deleted_tab_1", "ghost_plugin", "watchlist"]}
            currentVisibility={["unknown_vis"]}
            onSave={vi.fn()}
            onClose={vi.fn()}
          />,
        ),
      ).not.toThrow()

      expect(screen.getByText("Watchlist")).toBeInTheDocument()
      expect(screen.getByText("Overview")).toBeInTheDocument()
      expect(screen.getByText("Games")).toBeInTheDocument()
    })

    it("handles currentOrder with duplicate IDs without throwing", async () => {
      const { LibraryTabSettingsModal } = await import("../molecules/library-tab-settings-modal")
      const { render, screen } = await import("@testing-library/react")

      expect(() =>
        render(
          <LibraryTabSettingsModal
            allTabs={sampleTabs}
            currentOrder={["overview", "overview", "games"]}
            currentVisibility={["overview", "games"]}
            onSave={vi.fn()}
            onClose={vi.fn()}
          />,
        ),
      ).not.toThrow()

      expect(screen.getByText("Games")).toBeInTheDocument()
      expect(screen.getByText("Watchlist")).toBeInTheDocument()
    })
  })
})


