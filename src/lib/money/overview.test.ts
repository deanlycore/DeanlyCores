import assert from "node:assert/strict"
import test from "node:test"

import { aheadTileValue, attentionTileValue, insightsTileValue, OVERVIEW_COPY, spendTileValue } from "./overview.ts"

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

test("ahead tile is the next due amount and date, skipping income and overdue rows", () => {
  const events = [
    { date: null, amountCents: 5000, direction: "out" as const },
    { date: "2026-09-28", amountCents: 12000, direction: "out" as const },
    { date: "2026-10-10", amountCents: 240000, direction: "in" as const },
    { date: "2026-10-18", amountCents: 12000, direction: "out" as const },
    { date: "2026-10-06", amountCents: 3000, direction: "out" as const },
  ]
  assert.equal(aheadTileValue(events, "2026-10-02", "USD"), "$30 · Oct 6")
  assert.equal(aheadTileValue([], "2026-10-02", "USD"), OVERVIEW_COPY.nothingDue)
  assert.equal(
    aheadTileValue([{ date: "2026-10-18", amountCents: 12050, direction: "out" }], "2026-10-02", "USD"),
    "$120.50 · Oct 18",
  )
})

test("insights tile counts notes", () => {
  assert.equal(insightsTileValue(0), OVERVIEW_COPY.notEnough)
  assert.equal(insightsTileValue(1), "1 note")
  assert.equal(insightsTileValue(3), "3 notes")
})
