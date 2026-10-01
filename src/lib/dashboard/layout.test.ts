import assert from "node:assert/strict"
import test from "node:test"

import { defaultLayout, moveItem, normalizeLayout, setVisible } from "./layout.ts"

test("default layout shows the five home cards", () => {
  const layout = defaultLayout()
  assert.deepEqual(
    layout.map((item) => item.id),
    ["money", "tasks", "calendar", "goals", "reminders"],
  )
  assert.equal(layout.every((item) => item.visible), true)
})

test("reorder moves a card one step", () => {
  const layout = defaultLayout()
  const next = moveItem(layout, "tasks", -1)
  assert.equal(next[0]?.id, "tasks")
  assert.equal(next[1]?.id, "money")
  assert.equal(moveItem(layout, "money", -1), layout)
})

test("hiding a card keeps it available to add back", () => {
  const hidden = setVisible(defaultLayout(), "goals", false)
  assert.equal(hidden.find((item) => item.id === "goals")?.visible, false)
  assert.equal(setVisible(hidden, "goals", true).find((item) => item.id === "goals")?.visible, true)
})

test("normalize drops unknown cards and appends missing ones", () => {
  const layout = normalizeLayout([
    { id: "reminders", visible: true },
    { id: "nope", visible: true },
    { id: "reminders", visible: false },
  ])
  assert.equal(layout[0]?.id, "reminders")
  assert.equal(layout.filter((item) => item.id === "reminders").length, 1)
  assert.equal(layout.find((item) => item.id === "money")?.visible, false)
  assert.equal(layout.length, 5)
})

test("an empty saved layout falls back to the default home", () => {
  assert.deepEqual(normalizeLayout([]), defaultLayout())
  assert.deepEqual(normalizeLayout(null), defaultLayout())
})
