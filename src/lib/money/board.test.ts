import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  DEBT_COPY,
  MONEY_COPY,
  PHONE_MONEY_COPY,
  amountLabel,
  applyVisibility,
  balanceMetrics,
  billAmountLeft,
  billDueCopy,
  billMetrics,
  billPulseCells,
  bufferAmount,
  goalPercent,
  incomeGap,
  incomeMetrics,
  nextPayEvents,
  paymentToast,
  remainingCents,
  renewalPulseCells,
  savingsMetrics,
  sortBalances,
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

test("remaining is the starting amount minus payments, and the toast uses those amounts", () => {
  assert.equal(remainingCents(12000, [{ amount_cents: 4000 }, { amount_cents: 0 }]), 8000)
  assert.equal(remainingCents(4000, [{ amount_cents: 4000 }]), 0)
  assert.equal(remainingCents(1000, [{ amount_cents: 2500 }]), 0)
  assert.equal(billAmountLeft({ amount_cents: 9000, paid_at: null }, []), 9000)
  assert.equal(billAmountLeft({ amount_cents: 9000, paid_at: "2026-10-02T00:00:00Z" }, []), 0)
  assert.equal(billAmountLeft({ amount_cents: 12000, paid_at: null }, [{ amount_cents: 4000 }]), 8000)
  assert.equal(paymentToast(4000, 8000, "USD"), "$40 paid. $80 left.")
  assert.equal(paymentToast(4000, 0, "USD"), "$40 paid.")
  assert.equal(DEBT_COPY.overpay, "That’s more than what’s left.")
  assert.equal(DEBT_COPY.saved, "Saved.")
})

test("open balances sort ahead of settled ones, then by name", () => {
  const rows = sortBalances([
    { name: "Sam", remaining_cents: 0, visibility: "private" as const },
    { name: "Alex", remaining_cents: 4000, visibility: "private" as const },
    { name: "Riley", remaining_cents: 1000, visibility: "shared" as const },
  ])
  assert.deepEqual(rows.map((row) => row.name), ["Alex", "Riley", "Sam"])
  assert.deepEqual(balanceMetrics(rows), { open: 2, closed: 1, justMe: 2 })
})

test("phone and debt copy stays locked and does not name a household", () => {
  assert.equal(PHONE_MONEY_COPY.bills, "What’s still due.")
  assert.equal(PHONE_MONEY_COPY.income, "What’s coming in.")
  assert.equal(PHONE_MONEY_COPY.savings, "Set aside for later.")
  assert.equal(PHONE_MONEY_COPY.subscriptions, "What renews soon.")
  assert.equal(DEBT_COPY.cardsSubtitle, "Balances still open.")
  assert.equal(DEBT_COPY.peopleSubtitle, "People you still owe.")
  assert.equal(DEBT_COPY.cardsEmpty, "No cards yet.")
  assert.equal(DEBT_COPY.peopleEmpty, "Nothing owed to anyone yet.")
  assert.equal(DEBT_COPY.pulseEmpty, "Nothing open right now.")
  assert.equal(DEBT_COPY.paid, "Paid")
  assert.equal(DEBT_COPY.settled, "Settled")
  const copy = JSON.stringify({ PHONE_MONEY_COPY, DEBT_COPY })
  assert.equal(copy.includes("DeanFamily"), false)
  assert.equal(/debt-free|nice work|crush your debt|you’re behind/i.test(copy), false)
})

test("money phone uses the shared FAB clearance and debt stays off income and savings", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../components/money")
  for (const file of ["bills-board.tsx", "income-board.tsx", "savings-board.tsx", "subscriptions-board.tsx", "balance-board.tsx"]) {
    const source = readFileSync(join(root, file), "utf8")
    assert.match(source, /<PhoneFabClearance \/>/)
    assert.match(source, /<LifeFab>/)
    assert.match(source, /className="hidden md:block"/)
    assert.match(source, /phoneLayout/)
    assert.doesNotMatch(source, /h-12 md:hidden/)
  }
  assert.doesNotMatch(readFileSync(join(root, "income-board.tsx"), "utf8"), /Log payment/)
  assert.doesNotMatch(readFileSync(join(root, "savings-board.tsx"), "utf8"), /Log payment/)
  const balance = readFileSync(join(root, "balance-board.tsx"), "utf8")
  assert.match(balance, /DEBT_COPY\.cardsEmpty/)
  assert.match(balance, /DEBT_COPY\.peopleEmpty/)
  assert.match(balance, /visibilityDefault = row\?\.visibility \?\? "private"/)
  assert.doesNotMatch(balance, /DeanFamily/)
  const layout = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../app/(app)/money/layout.tsx"), "utf8")
  assert.match(layout, /tone="life"/)
})

test("card, person, and payment writes stay on the session client", () => {
  const records = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../actions/records.ts"), "utf8")
  function sliceFn(source: string, name: string) {
    const start = source.indexOf(`export async function ${name}`)
    assert.notEqual(start, -1, name)
    const next = source.indexOf("\nexport async function ", start + 10)
    return source.slice(start, next === -1 ? undefined : next)
  }
  for (const name of ["createMoneyCard", "createMoneyPerson", "logMoneyPayment"]) {
    const source = sliceFn(records, name)
    assert.match(source, /household_id: ready\.ctx\.householdId/)
    assert.match(source, /owner_id: ready\.ctx\.userId/)
    assert.doesNotMatch(source, /formData\.get\("household_id"\)/)
    assert.doesNotMatch(source, /formData\.get\("owner_id"\)/)
    assert.doesNotMatch(source, /service/i)
    assert.doesNotMatch(source, /activity_events/)
  }
  assert.match(sliceFn(records, "createMoneyCard"), /defaultVisibilityFor\("card"\)/)
  assert.match(sliceFn(records, "createMoneyPerson"), /defaultVisibilityFor\("person"\)/)
  assert.match(sliceFn(records, "logMoneyPayment"), /DEBT_COPY\.overpay/)
  assert.match(sliceFn(records, "setMoneyCardVisibility"), /setRecordVisibility\("money_cards"/)
  assert.match(sliceFn(records, "setMoneyPersonVisibility"), /setRecordVisibility\("money_people"/)
  assert.doesNotMatch(sliceFn(records, "logMoneyPayment"), /from\("activity_events"\)/)
})

test("cards and people migration is authenticated RLS with no new definer RPC", () => {
  const sql = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261003160000_money_cards_people_payments.sql"),
    "utf8",
  )
  assert.match(sql, /visibility public\.visibility not null default 'private'/)
  assert.match(sql, /grant select, insert, update, delete on table public\.money_cards to authenticated/)
  assert.match(sql, /grant select, insert, delete on table public\.money_payments to authenticated/)
  assert.match(sql, /revoke all on table public\.money_payments from public, anon/)
  assert.doesNotMatch(sql, /security definer/i)
  assert.doesNotMatch(sql, /create (or replace )?function/i)
  assert.doesNotMatch(sql, /grant .+ to anon/i)
  assert.doesNotMatch(sql, /grant .+ to public/i)
  assert.doesNotMatch(sql, /\b(cvv|card_number|account_number)\b/i)
  assert.doesNotMatch(sql, /service_role/)
})
