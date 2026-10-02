import assert from "node:assert/strict"
import test from "node:test"

import {
  MONEY_COPY,
  amountLabel,
  applyVisibility,
  billDueCopy,
  billMetrics,
  billPulseCells,
  bufferAmount,
  goalPercent,
  incomeGap,
  incomeMetrics,
  nextPayEvents,
  renewalPulseCells,
  savingsMetrics,
  sortBills,
  subscriptionMetrics,
} from "./board.ts"

const today = "2026-10-02"

const bills = [
  { id: "storage", name: "Storage", amount_cents: 9100, due_on: "2026-10-01", paid_at: null, visibility: "shared" as const },
  { id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", paid_at: null, visibility: "shared" as const },
  { id: "gym", name: "Gym", amount_cents: 3000, due_on: "2026-10-06", paid_at: null, visibility: "private" as const },
  { id: "internet", name: "Internet", amount_cents: 6000, due_on: "2026-10-08", paid_at: "2026-10-02T15:00:00Z", visibility: "shared" as const },
  { id: "gas", name: "Gas", amount_cents: 5500, due_on: "2026-10-11", paid_at: null, visibility: "shared" as const },
  { id: "truck", name: "Truck payment", amount_cents: 41700, due_on: "2026-10-13", paid_at: null, visibility: "shared" as const },
  { id: "rent", name: "Rent", amount_cents: 190000, due_on: "2026-11-01", paid_at: null, visibility: "shared" as const },
]

test("bills pulse keeps a week of dues, payday markers, and a sparse overdue cell", () => {
  const cells = billPulseCells(bills, today, ["2026-10-10", "2026-10-25"])
  assert.deepEqual(
    cells.map((cell) => [cell.date, cell.title, cell.tone]),
    [
      ["2026-10-01", "Storage", "overdue"],
      ["2026-10-03", "Electric", "soon"],
      ["2026-10-06", "Gym", "soon"],
      ["2026-10-10", "Paid", "payday"],
      ["2026-10-11", "Gas", "idle"],
      ["2026-10-13", "Truck payment", "idle"],
      ["2026-10-25", "Paid", "payday"],
    ],
  )
  assert.equal(cells.some((cell) => cell.tone === "overdue" && cell.detail.startsWith("$")), true)
})

test("an empty bill list has an empty pulse", () => {
  assert.deepEqual(billPulseCells([], today, ["2026-10-10"]), [
    { id: "pay-2026-10-10", date: "2026-10-10", day: "10", title: "Paid", detail: "day", tone: "payday" },
  ])
  assert.equal(billPulseCells([{ ...bills[3] }], today).length, 0)
})

test("bill copy stays calm and overdue is a word, not a shout", () => {
  assert.deepEqual(billDueCopy(bills[0], today), { text: "Overdue", tone: "danger" })
  assert.deepEqual(billDueCopy(bills[1], today), { text: "Due in 1 day", tone: "warn" })
  assert.deepEqual(billDueCopy(bills[4], today), { text: "Due Oct 11", tone: "muted" })
  assert.equal(billDueCopy(bills[3], today).text, "Paid")
  assert.equal(amountLabel(0, "USD"), "~")
})

test("metrics hide the overdue count at zero and label the buffer as an estimate", () => {
  const metrics = billMetrics(bills, today, 365000)
  assert.equal(metrics.dueThisWeek, 2)
  assert.equal(metrics.overdue, 1)
  assert.equal(metrics.paid, 1)
  assert.equal(metrics.bufferCents, 365000 - (9100 + 12000 + 3000 + 5500 + 41700))
  assert.equal(billMetrics([], today, null).overdue, 0)
  assert.equal(billMetrics([], today, null).bufferCents, null)
  assert.equal(bufferAmount(42000, "USD").startsWith("~"), true)
  assert.equal(bufferAmount(-4000, "USD").includes("4"), true)
  assert.equal(MONEY_COPY.buffer, "Buffer")
  assert.equal(MONEY_COPY.filterEmpty, "Nothing matches these filters.")
})

test("bills sort overdue, then due date, with Shared ahead on the same day", () => {
  const ordered = sortBills(
    [
      { name: "Gym", due_on: "2026-10-06", paid_at: null, visibility: "private" as const },
      { name: "Electric", due_on: "2026-10-20", paid_at: null, visibility: "shared" as const },
      { name: "Alpha", due_on: "2026-10-20", paid_at: null, visibility: "private" as const },
      { name: "Storage", due_on: "2026-10-01", paid_at: null, visibility: "private" as const },
      { name: "Water", due_on: "2026-09-01", paid_at: null, visibility: "shared" as const },
      { name: "Internet", due_on: "2026-10-08", paid_at: "2026-10-02", visibility: "shared" as const },
    ],
    today,
  ).map((bill) => bill.name)
  assert.deepEqual(ordered, ["Water", "Storage", "Gym", "Electric", "Alpha", "Internet"])
})

test("visibility filter keeps shared and just me apart", () => {
  assert.deepEqual(
    applyVisibility(bills, "private").map((bill) => bill.name),
    ["Gym"],
  )
  assert.equal(applyVisibility(bills, "all").length, bills.length)
})

test("income pulse is the next two pay events", () => {
  const rows = [
    { name: "Paycheck", amount_cents: 240000, spent_on: "2026-10-25", visibility: "shared" as const },
    { name: "Paycheck", amount_cents: 200000, spent_on: "2026-10-10", visibility: "shared" as const },
    { name: "Side gig", amount_cents: 8000, spent_on: "2026-09-30", visibility: "private" as const },
  ]
  assert.deepEqual(
    nextPayEvents(rows, today).map((row) => row.spent_on),
    ["2026-10-10", "2026-10-25"],
  )
  assert.equal(incomeMetrics(rows, today).nextDate, "2026-10-10")
  assert.equal(incomeMetrics(rows, today).monthCents, 240000 + 200000)
  const withReceived = [
    { name: "Paycheck", amount_cents: 240000, spent_on: "2026-10-25" },
    { name: "Paycheck", amount_cents: 200000, spent_on: "2026-10-01" },
  ]
  assert.equal(incomeGap(withReceived[0], withReceived, today), "A bit under what’s expected.")
  assert.equal(incomeGap(withReceived[1], withReceived, today), null)
})

test("savings progress stays capped and on track means money set aside", () => {
  assert.equal(goalPercent(180000, 500000), 36)
  assert.equal(goalPercent(900000, 500000), 100)
  assert.deepEqual(
    savingsMetrics([
      { current_cents: 180000 },
      { current_cents: 0 },
    ]),
    { onTrack: 1, setAside: 180000 },
  )
})

test("renewals stay inside the next month and paused rows stay out of the strip", () => {
  const cells = renewalPulseCells(
    [
      { id: "1", name: "Netflix", amount_cents: 1599, renews_on: "2026-10-18", active: true },
      { id: "2", name: "Music", amount_cents: 1099, renews_on: "2026-10-05", active: false },
      { id: "3", name: "Cloud", amount_cents: 299, renews_on: "2026-12-01", active: true },
    ],
    today,
  )
  assert.deepEqual(cells.map((cell) => cell.title), ["Netflix"])
  assert.equal(cells[0].tone, "idle")
  assert.deepEqual(subscriptionMetrics(
    [
      { amount_cents: 1599, renews_on: "2026-10-18", active: true },
      { amount_cents: 1099, renews_on: "2026-10-05", active: false },
    ],
    today,
  ), { renewing: 1, monthly: 1599 })
})

test("empty copy matches the locked lines", () => {
  assert.equal(MONEY_COPY.billsEmpty, "No bills yet. Add rent, utilities, or anything due.")
  assert.equal(MONEY_COPY.incomeEmpty, "No income sources yet. Add a paycheck or other source.")
  assert.equal(MONEY_COPY.savingsEmpty, "No savings goals yet. Start one when you’re ready.")
  assert.equal(MONEY_COPY.subscriptionsEmpty, "No subscriptions tracked. Add one to see renewals here.")
})
