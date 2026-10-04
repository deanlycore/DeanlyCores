import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { buildMoneySnapshot } from "./snapshot.ts"
import { FLOW_COPY, FLOW_WINDOWS, buildCashFlow, type FlowIncome, type FlowSubscription } from "./flow.ts"

const today = "2026-10-02"
const root = dirname(fileURLToPath(import.meta.url))

const income: FlowIncome[] = [
  { id: "paycheck", name: "Paycheck", amount_cents: 240000, spent_on: "2026-10-10" },
  { id: "side", name: "Side work", amount_cents: 18000, spent_on: "2026-10-25" },
]

const bills = [
  { id: "rent", name: "Rent", amount_cents: 150000, due_on: "2026-11-01", paid_at: null },
  { id: "mortgage", name: "Mortgage insurance", amount_cents: 12000, due_on: "2026-10-18", paid_at: null },
  { id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", paid_at: null },
  { id: "water", name: "Water", amount_cents: 6500, due_on: "2026-10-11", paid_at: null },
  { id: "truck", name: "Truck payment", amount_cents: 41700, due_on: "2026-10-13", paid_at: null },
  { id: "gym", name: "Gym", amount_cents: 3000, due_on: "2026-10-06", paid_at: null },
]

const subscriptions: FlowSubscription[] = [
  { id: "music", name: "Music", amount_cents: 4200, renews_on: "2026-10-12", active: true, cadence: "month" },
  { id: "shows", name: "Shows", amount_cents: 4200, renews_on: "2026-10-20", active: true, cadence: "month" },
  { id: "domain", name: "Domain", amount_cents: 12000, renews_on: "2026-12-01", active: true, cadence: "year" },
]

const cards = [
  { id: "visa", name: "Household visa", amount_cents: 64000, due_on: "2026-10-18" },
  { id: "debit", name: "Everyday debit", amount_cents: 2500, due_on: null },
]

const people = [
  { id: "alex", name: "Alex", amount_cents: 6000, due_on: null, direction: "owe" as const },
  { id: "jordan", name: "Jordan", amount_cents: 2500, due_on: null, direction: "owed" as const },
]

const payments = [{ bill_id: null, card_id: null, person_id: "alex", amount_cents: 2000 }]

const goals = [
  { id: "emergency", name: "Emergency fund", target_cents: 100000, current_cents: 40000 },
  { id: "beach", name: "Beach week", target_cents: 50000, current_cents: 15000 },
]

function sharedOnly() {
  return buildCashFlow({
    today,
    days: 30,
    bufferCents: 0,
    income: income.filter((row) => row.id !== "side"),
    bills: bills.filter((row) => row.id !== "gym"),
    payments: [],
    goals: [],
    subscriptions: subscriptions.filter((row) => row.id !== "shows"),
    cards: [],
    people: [],
  })
}

test("thirty days lists the window and does not count a snapshot row twice", () => {
  const model = buildCashFlow({
    today,
    days: 30,
    bufferCents: 0,
    income,
    bills,
    payments,
    goals,
    subscriptions,
    cards,
    people,
  })
  const snapshot = buildMoneySnapshot({
    today,
    income,
    bills,
    payments,
    goals,
    subscriptions,
    bufferCents: 0,
  })

  assert.equal(model.empty, false)
  assert.equal(model.todayCents, snapshot.availableCents)
  assert.equal(model.todayCents, 174400)
  assert.equal(model.incomeCents, 258000)
  assert.equal(model.expenseCents, 297600)
  assert.equal(model.lowCents, -39600)
  assert.equal(model.endCents, -39600)
  assert.equal(model.belowBuffer, false)
  assert.equal(model.alreadyCounted, true)
  assert.equal(FLOW_COPY.alreadyCounted, "Some of these dates are already in what’s left this month.")
  assert.deepEqual(
    model.events.map((row) => [row.name, row.date, row.amountCents, row.direction]),
    [
      ["Electric", "2026-10-03", 12000, "out"],
      ["Gym", "2026-10-06", 3000, "out"],
      ["Paycheck", "2026-10-10", 240000, "in"],
      ["Water", "2026-10-11", 6500, "out"],
      ["Music", "2026-10-12", 4200, "out"],
      ["Truck payment", "2026-10-13", 41700, "out"],
      ["Household visa", "2026-10-18", 64000, "out"],
      ["Mortgage insurance", "2026-10-18", 12000, "out"],
      ["Shows", "2026-10-20", 4200, "out"],
      ["Side work", "2026-10-25", 18000, "in"],
      ["Rent", "2026-11-01", 150000, "out"],
    ],
  )
  assert.equal(model.events.some((row) => row.name === "Domain" || row.name === "Everyday debit"), false)
  assert.equal(model.events.some((row) => row.name === "Alex" || row.name === "Jordan"), false)
  assert.equal(model.events.some((row) => row.name === "Emergency fund"), false)
})

test("a just me row missing from the readable list stays out of the lines and the totals", () => {
  const model = sharedOnly()
  const names = model.events.map((row) => row.name)
  assert.equal(names.includes("Gym"), false)
  assert.equal(names.includes("Side work"), false)
  assert.equal(names.includes("Shows"), false)
  assert.equal(names.includes("Household visa"), false)
  assert.equal(model.incomeCents, 240000)
  assert.equal(model.expenseCents, 226400)
  assert.equal(model.todayCents, 163600)
  assert.equal(model.endCents, 13600)
  assert.equal(model.lowCents, -12000)
})

test("seven days keeps the snapshot number when those dates are already in it", () => {
  const model = buildCashFlow({
    today,
    days: 7,
    bufferCents: 0,
    income,
    bills,
    payments,
    goals,
    subscriptions,
    cards,
    people,
  })
  assert.deepEqual(
    model.events.map((row) => row.name),
    ["Electric", "Gym"],
  )
  assert.equal(model.incomeCents, 0)
  assert.equal(model.expenseCents, 15000)
  assert.equal(model.todayCents, 174400)
  assert.equal(model.lowCents, 174400)
  assert.equal(model.endCents, 174400)
})

test("a yearly renewal counts the full price once, and only inside the window", () => {
  const ninety = buildCashFlow({
    today,
    days: 90,
    bufferCents: 0,
    income,
    bills: [],
    payments: [],
    goals: [],
    subscriptions,
    cards: [],
    people: [],
  })
  const domain = ninety.events.find((row) => row.name === "Domain")
  assert.equal(domain?.amountCents, 12000)
  assert.equal(domain?.date, "2026-12-01")
  assert.notEqual(domain?.amountCents, 1000)

  const thirty = buildCashFlow({
    today,
    days: 30,
    bufferCents: 0,
    income,
    bills: [],
    payments: [],
    goals: [],
    subscriptions,
    cards: [],
    people: [],
  })
  assert.equal(thirty.events.some((row) => row.name === "Domain"), false)
  assert.equal(FLOW_WINDOWS.includes(30), true)
  assert.equal(FLOW_WINDOWS.length, 3)
})

test("nothing tracked and nothing due stays empty instead of a zero chart", () => {
  const model = buildCashFlow({
    today,
    days: 30,
    bufferCents: 0,
    income: [{ id: "old", name: "Last paycheck", amount_cents: 240000, spent_on: "2026-09-15" }],
    bills: [],
    payments: [],
    goals: [{ id: "emergency", name: "Emergency fund", target_cents: 100000, current_cents: 40000 }],
    subscriptions: [{ id: "paused", name: "Paused", amount_cents: 4200, renews_on: "2026-10-12", active: false }],
    cards: [{ id: "debit", name: "Everyday debit", amount_cents: 2500, due_on: null }],
    people: [{ id: "alex", name: "Alex", amount_cents: 6000, due_on: null, direction: "owe" }],
  })
  assert.equal(model.empty, true)
  assert.equal(model.todayCents, null)
  assert.equal(model.lowCents, null)
  assert.equal(model.endCents, null)
  assert.equal(model.events.length, 0)
  assert.equal(FLOW_COPY.empty, "Not enough tracked yet.")
})

test("bills due with no expected income do not invent a starting balance", () => {
  const model = buildCashFlow({
    today,
    days: 7,
    bufferCents: 0,
    income: [],
    bills: [{ id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", paid_at: null }],
    payments: [],
    goals: [],
    subscriptions: [],
    cards: [],
    people: [],
  })
  assert.equal(model.empty, false)
  assert.equal(model.todayCents, null)
  assert.equal(model.expenseCents, 12000)
  assert.equal(model.lowCents, null)
  assert.equal(model.endCents, null)
})

test("a partial bill, a logged card payment, and a person due date use what’s left", () => {
  const model = buildCashFlow({
    today,
    days: 30,
    bufferCents: 0,
    income: [{ id: "paycheck", name: "Paycheck", amount_cents: 200000, spent_on: "2026-10-10" }],
    bills: [{ id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", paid_at: null }],
    payments: [
      { bill_id: "electric", card_id: null, person_id: null, amount_cents: 2000 },
      { bill_id: null, card_id: "visa", person_id: null, amount_cents: 4000 },
      { bill_id: null, card_id: null, person_id: "sam", amount_cents: 1500 },
    ],
    goals: [],
    subscriptions: [],
    cards: [{ id: "visa", name: "Household visa", amount_cents: 10000, due_on: "2026-10-18" }],
    people: [
      { id: "sam", name: "Sam", amount_cents: 4000, due_on: "2026-10-15", direction: "owe" },
      { id: "jay", name: "Jay", amount_cents: 2500, due_on: "2026-10-16", direction: "owed" },
    ],
  })
  assert.equal(model.events.find((row) => row.name === "Electric")?.amountCents, 10000)
  assert.equal(model.events.find((row) => row.name === "Household visa")?.amountCents, 6000)
  assert.equal(model.events.find((row) => row.name === "Sam")?.amountCents, 2500)
  assert.equal(model.events.find((row) => row.name === "Sam")?.direction, "out")
  assert.equal(model.events.find((row) => row.name === "Jay")?.direction, "in")
})

test("a set contribution is listed and a goal balance is not treated as one", () => {
  const model = buildCashFlow({
    today,
    days: 30,
    bufferCents: 0,
    income: [{ id: "paycheck", name: "Paycheck", amount_cents: 50000, spent_on: "2026-10-10" }],
    bills: [],
    payments: [],
    goals: [
      { id: "emergency", name: "Emergency fund", contribution_cents: 5000, target_cents: 100000, current_cents: 40000 },
      { id: "beach", name: "Beach week", target_cents: 50000, current_cents: 15000 },
    ],
    subscriptions: [],
    cards: [],
    people: [],
  })
  assert.deepEqual(
    model.events.map((row) => [row.name, row.date, row.amountCents]),
    [
      ["Emergency fund", null, 5000],
      ["Paycheck", "2026-10-10", 50000],
    ],
  )
  assert.equal(model.todayCents, 45000)
  assert.equal(model.endCents, 45000)
  assert.equal(model.lowCents, -5000)
})

test("the low point under the buffer is a flag, and the snapshot formula stays the starting number", () => {
  const model = buildCashFlow({
    today,
    days: 30,
    bufferCents: 20000,
    income: [{ id: "paycheck", name: "Paycheck", amount_cents: 50000, spent_on: "2026-10-20" }],
    bills: [{ id: "electric", name: "Electric", amount_cents: 10000, due_on: "2026-10-05", paid_at: null }],
    payments: [],
    goals: [],
    subscriptions: [],
    cards: [],
    people: [],
  })
  const snapshot = buildMoneySnapshot({
    today,
    income: [{ amount_cents: 50000, spent_on: "2026-10-20" }],
    bills: [{ id: "electric", name: "Electric", amount_cents: 10000, due_on: "2026-10-05", paid_at: null }],
    payments: [],
    goals: [],
    subscriptions: [],
    bufferCents: 20000,
  })
  assert.equal(model.todayCents, snapshot.availableCents)
  assert.equal(model.todayCents, 20000)
  assert.equal(model.lowCents, -30000)
  assert.equal(model.endCents, 20000)
  assert.equal(model.belowBuffer, true)
  assert.equal(FLOW_COPY.belowBuffer, "The low point is under the safety buffer.")
})

test("the flow sits under the snapshot, above the pills, and does not grow the six sections", () => {
  const layout = readFileSync(join(root, "../../app/(app)/money/layout.tsx"), "utf8")
  const flow = readFileSync(join(root, "../../components/money/money-flow.tsx"), "utf8")
  const nav = readFileSync(join(root, "../navigation.ts"), "utf8")
  const board = readFileSync(join(root, "board.ts"), "utf8")
  assert.ok(layout.indexOf("<MoneySnapshot") < layout.indexOf("<MoneyFlow"))
  assert.ok(layout.indexOf("<MoneyFlow") < layout.indexOf("<SectionSegments"))
  assert.match(layout, /mb-4 md:mb-5/)
  assert.match(board, /MONEY_SCAN_SECTIONS = \["bills", "income", "savings", "subscriptions", "cards", "people"\]/)
  assert.doesNotMatch(nav, /cash flow|Looking ahead/)
  assert.match(flow, /FLOW_COPY\.empty/)
  assert.match(flow, /text-ink/)
  assert.match(flow, /7 days|30 days|90 days|option\} days/)
  assert.doesNotMatch(flow, /type="date"|text-danger|supabase|service_role|DeanFamily|householdName/)
  assert.doesNotMatch(flow, /<svg|recharts|score/)
})
