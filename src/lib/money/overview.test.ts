import assert from "node:assert/strict"
import test from "node:test"

import { aheadTileValue, attentionTileValue, insightsTileValue, OVERVIEW_COPY, spendTileValue } from "./overview.ts"

const seededBills = [
  { id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", paid_at: null },
  { id: "gym", name: "Gym", amount_cents: 3000, due_on: "2026-10-06", paid_at: null },
  { id: "truck", name: "Truck payment", amount_cents: 41700, due_on: "2026-10-13", paid_at: null },
  { id: "mortgage", name: "Mortgage insurance", amount_cents: 12000, due_on: "2026-10-18", paid_at: null },
  { id: "rent", name: "Rent", amount_cents: 150000, due_on: "2026-11-01", paid_at: null },
]

test("spend tile uses available to spend, or not tracked when income is missing", () => {
  assert.equal(spendTileValue(false, null, "USD"), OVERVIEW_COPY.notTracked)
  assert.equal(spendTileValue(true, null, "USD"), OVERVIEW_COPY.notTracked)
  assert.equal(spendTileValue(true, 184200, "USD"), "$1,842")
  assert.equal(spendTileValue(true, -5000, "USD"), "−$50")
})

test("attention tile counts the existing list and marks overdue or due tomorrow", () => {
  assert.deepEqual(attentionTileValue([]), { text: "None yet", urgent: false })
  assert.deepEqual(attentionTileValue([{ urgent: false }]), { text: "1 bill", urgent: false })
  assert.deepEqual(attentionTileValue([{ urgent: false }, { urgent: true }]), { text: "2 bills", urgent: true })
})

test("ahead is the earliest bill due on or after today, never a past date", () => {
  const today = "2026-10-14"
  assert.equal(aheadTileValue(seededBills, [], today, "USD"), "$120 · Oct 18")
  assert.equal(aheadTileValue(seededBills, [], "2026-10-02", "USD"), "$120 · Oct 3")
  assert.equal(aheadTileValue(seededBills, [], "2026-10-18", "USD"), "$120 · Oct 18")
  assert.equal(aheadTileValue(seededBills, [], "2026-11-02", "USD"), OVERVIEW_COPY.nothingDue)
  assert.equal(
    aheadTileValue(
      [
        { id: "late", name: "Zeta", amount_cents: 5000, due_on: "2026-10-18", paid_at: null },
        { id: "same", name: "Alpha", amount_cents: 8000, due_on: "2026-10-18", paid_at: null },
        { id: "old", name: "Old", amount_cents: 90000, due_on: "2026-10-01", paid_at: null },
      ],
      [],
      today,
      "USD",
    ),
    "$80 · Oct 18",
  )
  assert.equal(
    aheadTileValue(
      [{ id: "paid", name: "Mortgage insurance", amount_cents: 12000, due_on: "2026-10-18", paid_at: "2026-10-14" }],
      [],
      today,
      "USD",
    ),
    OVERVIEW_COPY.nothingDue,
  )
})

test("insights tile counts notes", () => {
  assert.equal(insightsTileValue(0), OVERVIEW_COPY.notEnough)
  assert.equal(insightsTileValue(1), "1 note")
  assert.equal(insightsTileValue(3), "3 notes")
})
