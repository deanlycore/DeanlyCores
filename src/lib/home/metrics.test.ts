import assert from "node:assert/strict"
import test from "node:test"

import {
  billStatus,
  billsDueThisWeek,
  budgetPulse,
  featuredMeal,
  greetingFor,
  parseCents,
  spentAgainstBudget,
  startOfZonedDay,
  taskProgress,
  weekBounds,
} from "./metrics.ts"

test("week starts on Monday", () => {
  assert.deepEqual(weekBounds("2026-10-01"), { start: "2026-09-28", end: "2026-10-04" })
  assert.deepEqual(weekBounds("2026-10-04"), { start: "2026-09-28", end: "2026-10-04" })
})

test("bill status uses words, not color alone", () => {
  assert.equal(billStatus({ paid_at: "2026-10-01", due_on: "2026-09-01" }, "2026-10-01"), "paid")
  assert.equal(billStatus({ paid_at: null, due_on: "2026-09-30" }, "2026-10-01"), "overdue")
  assert.equal(billStatus({ paid_at: null, due_on: "2026-10-03" }, "2026-10-01"), "due_soon")
  assert.equal(billStatus({ paid_at: null, due_on: "2026-10-10" }, "2026-10-01"), "on_time")
})

test("this week counts only unpaid bills inside seven days", () => {
  const bills = [
    { name: "Electric", due_on: "2026-10-03", paid_at: null },
    { name: "Rent", due_on: "2026-09-01", paid_at: null },
    { name: "Water", due_on: "2026-10-02", paid_at: "2026-10-01" },
    { name: "Later", due_on: "2026-10-20", paid_at: null },
  ]
  assert.deepEqual(
    billsDueThisWeek(bills, "2026-10-01").map((bill) => bill.name),
    ["Electric"],
  )
})

test("budget turns over only after the full amount is spent", () => {
  const calm = budgetPulse(365000, 120000)
  assert.equal(calm.over, false)
  assert.equal(calm.remaining, 245000)
  const over = budgetPulse(10000, 12000)
  assert.equal(over.over, true)
  assert.equal(over.ratio, 1)
  assert.equal(budgetPulse(null, 0).remaining, null)
})

test("shared household spend ignores private expenses", () => {
  assert.equal(
    spentAgainstBudget(
      [
        { amount_cents: 5000, kind: "expense", visibility: "shared" },
        { amount_cents: 9000, kind: "expense", visibility: "private" },
        { amount_cents: 2000, kind: "income", visibility: "shared" },
      ],
      "shared",
    ),
    5000,
  )
})

test("today's tasks count completed and open", () => {
  assert.deepEqual(
    taskProgress([{ completed_at: "x" }, { completed_at: null }, { completed_at: "y" }]),
    { done: 2, total: 3 },
  )
})

test("dinner tonight wins the meal hero", () => {
  const meal = featuredMeal(
    [
      { title: "Oats", meal_on: "2026-10-01", slot: "breakfast" },
      { title: "Lemon chicken", meal_on: "2026-10-01", slot: "dinner" },
      { title: "Soup", meal_on: "2026-10-02", slot: "dinner" },
    ],
    "2026-10-01",
  )
  assert.equal(meal?.title, "Lemon chicken")
})

test("greeting follows the household clock", () => {
  assert.equal(greetingFor("America/New_York", "Alex Dean", new Date("2026-10-01T14:00:00Z")), "Good morning, Alex!")
  assert.equal(greetingFor("America/New_York", "Alex Dean", new Date("2026-10-01T18:30:00Z")), "Good afternoon, Alex!")
  assert.equal(greetingFor("America/New_York", "Alex Dean", new Date("2026-10-02T02:30:00Z")), "Good evening, Alex!")
})

test("a New York day starts at 04:00 UTC during daylight time", () => {
  assert.equal(startOfZonedDay("2026-10-01", "America/New_York"), "2026-10-01T04:00:00.000Z")
})

test("money parsing keeps cents and rejects junk", () => {
  assert.equal(parseCents("$1,200.50"), 120050)
  assert.equal(parseCents("12"), 1200)
  assert.equal(parseCents(""), null)
  assert.equal(parseCents("-4"), null)
})
