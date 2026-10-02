import assert from "node:assert/strict"
import test from "node:test"

import { defaultVisibilityFor } from "./visibility.ts"

test("household records default to shared even after a private choice", () => {
  for (const kind of ["bill", "event", "meal", "shopping", "budget"]) {
    assert.equal(defaultVisibilityFor(kind, "private"), "shared")
  }
})

test("personal notes and uploads default to just me", () => {
  assert.equal(defaultVisibilityFor("note", "shared"), "private")
  assert.equal(defaultVisibilityFor("upload", "shared"), "private")
})

test("other records keep the household member's last choice", () => {
  assert.equal(defaultVisibilityFor("task", "private"), "private")
  assert.equal(defaultVisibilityFor("goal", "shared"), "shared")
  assert.equal(defaultVisibilityFor("expense", "private"), "private")
})
