// TODO: Review this file
import { describe, expect, it } from "vitest"
import { listKeys } from "./list-keys"

describe("listKeys", () => {
  it("returns the base key", () => {
    expect(listKeys.all()).toEqual(["lists"])
  })

  it("returns the mine key", () => {
    expect(listKeys.mine()).toEqual(["lists", "mine"])
  })

  it("returns the public key", () => {
    expect(listKeys.public()).toEqual(["lists", "public"])
  })

  it("returns a detail key for a specific list id", () => {
    expect(listKeys.detail("abc123")).toEqual(["lists", "detail", "abc123"])
  })
})
