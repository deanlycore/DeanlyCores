import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  DEBT_COPY,
  MONEY_COPY,
  MONEY_STARTERS,
  OTHER_LABEL,
  PHONE_MONEY_COPY,
  moneyScanBlockId,
  moneyScanHref,
  moneyScanSection,
  moneyScanSectionFromHref,
  amountLabel,
  applyVisibility,
  balanceMetrics,
  billAmountLeft,
  billDueCopy,
  billMetrics,
  billPulseCells,
  bufferAmount,
  cardLimitLine,
  categoryChoices,
  categoryGroupLabel,
  cleanCategory,
  defaultGroupOpen,
  goalPercent,
  groupMoney,
  incomeGap,
  incomeGroupTotal,
  incomeMetrics,
  monthlyLine,
  monthlySubscriptionCents,
  nextPayEvents,
  paymentToast,
  personDirection,
  personGroupLabel,
  remainingCents,
  renewalPulseCells,
  savingsMetrics,
  sortBalances,
  sortBills,
  subscriptionGroupTotal,
  subscriptionMetrics,
} from "./board.ts"
import { CATEGORY_WORDS, categoryToStore, matchMoneyGroup, placeMoneyCategory } from "./category-match.ts"

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
  assert.equal(DEBT_COPY.peopleSubtitle, "I owe, and they owe me.")
  assert.equal(DEBT_COPY.cardsEmpty, "No cards yet.")
  assert.equal(DEBT_COPY.peopleEmpty, "Nothing owed to anyone yet.")
  assert.equal(DEBT_COPY.pulseEmpty, "Nothing open right now.")
  assert.equal(DEBT_COPY.paid, "Paid")
  assert.equal(DEBT_COPY.settled, "Settled")
  const copy = JSON.stringify({ PHONE_MONEY_COPY, DEBT_COPY })
  assert.equal(copy.includes("DeanFamily"), false)
  assert.equal(/debt-free|nice work|crush your debt|you’re behind/i.test(copy), false)
})

test("money scan block ids stay on the category page", () => {
  assert.equal(moneyScanBlockId("/money/bills"), "money-bills")
  assert.equal(moneyScanBlockId("/money/income"), "money-income")
  assert.equal(moneyScanBlockId("/money/savings"), "money-savings")
  assert.equal(moneyScanBlockId("/money/subscriptions"), "money-subscriptions")
  assert.equal(moneyScanBlockId("/money/cards"), "money-cards")
  assert.equal(moneyScanBlockId("/money/people"), "money-people")
  assert.equal(moneyScanBlockId("/life/tasks"), "")
  assert.equal(moneyScanBlockId("/money"), "")
})

test("each money pill has its own address and bills is the default", () => {
  assert.equal(moneyScanSection(undefined), "bills")
  assert.equal(moneyScanSection(null), "bills")
  assert.equal(moneyScanSection(""), "bills")
  assert.equal(moneyScanSection("budget"), "bills")
  assert.equal(moneyScanSection("debt"), "bills")
  assert.equal(moneyScanSection(["cards", "people"]), "cards")
  assert.equal(moneyScanSection("people"), "people")
  assert.equal(moneyScanHref("bills"), "/money")
  assert.equal(moneyScanHref("income"), "/money?section=income")
  assert.equal(moneyScanHref("savings"), "/money?section=savings")
  assert.equal(moneyScanHref("subscriptions"), "/money?section=subscriptions")
  assert.equal(moneyScanHref("cards"), "/money?section=cards")
  assert.equal(moneyScanHref("people"), "/money?section=people")
  assert.equal(moneyScanHref("cards", "/preview/money"), "/preview/money?section=cards")
  assert.equal(moneyScanSectionFromHref("/money/bills"), "bills")
  assert.equal(moneyScanSectionFromHref("/money/people"), "people")
  assert.equal(moneyScanSectionFromHref("/money/budget"), null)
  assert.equal(moneyScanSectionFromHref("/life/tasks"), null)
})

test("money page shows one scan section and drops the spending dump", () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../app/(app)/money/page.tsx"), "utf8")
  const scan = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../components/money/money-scan.tsx"), "utf8")
  const shell = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../components/shell/app-shell.tsx"), "utf8")
  const segments = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../components/shell/section-segments.tsx"), "utf8")
  assert.match(page, /MoneyScan/)
  assert.match(page, /moneyScanSection/)
  assert.doesNotMatch(page, /MoneyBoard|listMonthBudget|listExpenses\("expense"\)|Set budget|Log spending/)
  for (const label of ["BillsBoard", "IncomeBoard", "SavingsBoard", "SubscriptionsBoard", "CardsBoard", "PeopleBoard"]) {
    assert.match(scan, new RegExp(`section === "${label.replace("Board", "").toLowerCase()}"[\\s\\S]*<${label}`))
  }
  assert.match(scan, /useState<MoneyVisibility>\("all"\)/)
  assert.match(scan, /<PhoneFabClearance \/>/)
  assert.doesNotMatch(scan, /LifeFab|Set budget|Log spending|Budget/)
  assert.match(shell, /href: "\/money", label: "Money"/)
  assert.doesNotMatch(shell, /href: "\/money\/bills", label: "Money"/)
  assert.match(segments, /pathname === "\/money"/)
  assert.match(segments, /moneyScanHref/)
  assert.doesNotMatch(segments, /scrollIntoView/)
})

test("money phone uses the shared FAB clearance and debt stays off income and savings", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../components/money")
  const notesSpacer = /<div aria-hidden="true" className="h-12 md:hidden" \/>/
  for (const file of ["bills-board.tsx", "income-board.tsx", "savings-board.tsx", "subscriptions-board.tsx"]) {
    const source = readFileSync(join(root, file), "utf8")
    assert.match(source, /<PhoneFabClearance \/>/)
    assert.match(source, /<LifeFab>/)
    assert.match(source, /className="hidden md:block"/)
    assert.match(source, /phoneLayout/)
    assert.doesNotMatch(source, /h-12 md:hidden/)
  }
  const balance = readFileSync(join(root, "balance-board.tsx"), "utf8")
  assert.match(balance, /<PhoneFabClearance \/>/)
  assert.match(balance, notesSpacer)
  assert.match(balance, /<LifeFab>/)
  assert.doesNotMatch(readFileSync(join(root, "income-board.tsx"), "utf8"), /Log payment/)
  assert.doesNotMatch(readFileSync(join(root, "savings-board.tsx"), "utf8"), /Log payment/)
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

test("groups keep starter order, hide empty groups, and park a blank category in Other", () => {
  const rows = [
    { id: "gym", category: null as string | null, left: 3000 },
    { id: "water", category: "Utilities", left: 6500 },
    { id: "rent", category: "Housing", left: 150000 },
    { id: "lane", category: "Lane", left: 4000 },
    { id: "insure", category: "  housing ", left: 12000 },
  ]
  const groups = groupMoney(
    "bills",
    rows,
    (row) => categoryGroupLabel("bills", row.category),
    (groupRows) => groupRows.reduce((sum, row) => sum + row.left, 0),
  )
  assert.deepEqual(
    groups.map((group) => [group.label, group.rows.map((row) => row.id), group.totalCents]),
    [
      ["Housing", ["rent", "insure"], 162000],
      ["Utilities", ["water"], 6500],
      ["Lane", ["lane"], 4000],
      ["Other", ["gym"], 3000],
    ],
  )
  assert.equal(groups.some((group) => group.label === "Insurance"), false)
  assert.equal(categoryGroupLabel("income", ""), "Other Income")
  assert.equal(categoryGroupLabel("savings", null), "Other Goals")
})

test("a name match uses the starter list on this device and leaves a real group alone", () => {
  assert.equal(matchMoneyGroup("bills", "Rent"), "Housing")
  assert.equal(matchMoneyGroup("bills", "electric"), "Utilities")
  assert.equal(matchMoneyGroup("bills", "Electric bill"), "Utilities")
  assert.equal(matchMoneyGroup("subscriptions", "Netflix"), "Streaming")
  assert.equal(matchMoneyGroup("bills", "Gym"), "Other")
  assert.equal(matchMoneyGroup("subscriptions", "Gym"), "Fitness")
  assert.equal(matchMoneyGroup("income", "Paycheck"), "Primary Income")
  assert.equal(matchMoneyGroup("income", "Birthday money"), "Other Income")
  assert.equal(matchMoneyGroup("savings", "Emergency fund"), "Emergency Fund")
  assert.equal(matchMoneyGroup("cards", "Household visa"), "Credit Cards")
  assert.equal(matchMoneyGroup("cards", "Everyday debit"), "Debit Cards")
  assert.equal(matchMoneyGroup("cards", "Store card"), "Other")
  assert.equal(matchMoneyGroup("bills", "car insurance"), "Insurance")
  assert.equal(matchMoneyGroup("bills", "Truck payment"), "Debt & Loans")
  assert.equal(matchMoneyGroup("bills", "Mortgage insurance"), "Housing")
  assert.equal(matchMoneyGroup("bills", "Gas station"), "Transportation")
  assert.equal(matchMoneyGroup("bills", "parent"), "Other")
  assert.equal(matchMoneyGroup("bills", "carpet"), "Other")
  assert.equal(matchMoneyGroup("subscriptions", "YouTube Music"), "Music")
  assert.equal(matchMoneyGroup("cards", "Visa debit"), "Debit Cards")

  assert.equal(categoryToStore("bills", "Rent", ""), "Housing")
  assert.equal(categoryToStore("bills", "Rent", "Other"), "Housing")
  assert.equal(categoryToStore("bills", "Rent", "  other "), "Housing")
  assert.equal(categoryToStore("bills", "Rent", "Insurance", "manual"), "Insurance")
  assert.equal(categoryToStore("bills", "Electric", "Housing", "auto"), "Utilities")
  assert.equal(categoryToStore("bills", "Rent", "Lane"), "Lane")
  assert.equal(categoryToStore("bills", "Rent", "<b>Lane</b>"), "Lane")
  assert.equal(categoryToStore("bills", "Gym", null), null)
  assert.equal(categoryToStore("bills", "Gym", "Other", "auto"), null)
  assert.equal(categoryToStore("subscriptions", "Netflix", ""), "Streaming")
  assert.equal(categoryToStore("income", "Birthday money", "Other Income"), null)
  assert.equal(categoryToStore("cards", "Store card", "Other"), null)
  assert.equal(placeMoneyCategory("bills", "Rent", null), "Housing")
  assert.equal(placeMoneyCategory("bills", "Rent", "Other"), "Housing")
  assert.equal(placeMoneyCategory("bills", "Netflix", "Housing"), "Housing")
  assert.equal(placeMoneyCategory("bills", "Gym", null), "Other")
  assert.equal(placeMoneyCategory("income", "", null), "Other Income")

  const rows = [
    { id: "rent", name: "Rent", category: null as string | null, visibility: "private" as const, left: 190000 },
    { id: "power", name: "Electric", category: "Other", visibility: "shared" as const, left: 12000 },
    { id: "gym", name: "Gym", category: null as string | null, visibility: "shared" as const, left: 3000 },
    { id: "lane", name: "Rent", category: "Lane", visibility: "shared" as const, left: 4000 },
  ]
  const shared = applyVisibility(rows, "shared")
  const groups = groupMoney(
    "bills",
    shared,
    (row) => placeMoneyCategory("bills", row.name, row.category),
    (groupRows) => groupRows.reduce((sum, row) => sum + row.left, 0),
  )
  assert.deepEqual(
    groups.map((group) => [group.label, group.rows.map((row) => row.id), group.totalCents]),
    [
      ["Utilities", ["power"], 12000],
      ["Lane", ["lane"], 4000],
      ["Other", ["gym"], 3000],
    ],
  )
  assert.equal(groups.some((group) => group.rows.some((row) => row.id === "rent")), false)
  assert.equal(categoryChoices("bills", shared.map((row) => row.category)).includes("Secret gym fund"), false)

  for (const section of Object.keys(MONEY_STARTERS) as (keyof typeof MONEY_STARTERS)[]) {
    const starters = new Set<string>(MONEY_STARTERS[section])
    const other = OTHER_LABEL[section]
    for (const [group, list] of Object.entries(CATEGORY_WORDS[section])) {
      assert.equal(starters.has(group), true, `${section} ${group}`)
      assert.notEqual(group, other)
      assert.ok(list.length > 0, group)
    }
    assert.equal(Object.hasOwn(CATEGORY_WORDS[section], other), false)
  }
  assert.equal(Object.hasOwn(CATEGORY_WORDS, "people"), false)
})

test("people split into I owe and They owe me, and an empty direction stays hidden", () => {
  const groups = groupMoney(
    "people",
    [
      { id: "jordan", direction: "owed", left: 2500 },
      { id: "alex", direction: null, left: 4000 },
    ],
    (row) => personGroupLabel(row.direction),
    (groupRows) => groupRows.reduce((sum, row) => sum + row.left, 0),
  )
  assert.deepEqual(
    groups.map((group) => [group.label, group.totalCents]),
    [
      ["I owe", 4000],
      ["They owe me", 2500],
    ],
  )
  assert.equal(personDirection("nope"), "owe")
  assert.equal(personGroupLabel("owe"), "I owe")
  const onlyOwed = groupMoney("people", [{ id: "sam", direction: "owed" }], (row) => personGroupLabel(row.direction), () => null)
  assert.deepEqual(onlyOwed.map((group) => group.label), ["They owe me"])
})

test("suggestion names come from starters plus rows already in hand", () => {
  const choices = categoryChoices("bills", ["Lane", null, "utilities", "Secret is not here"])
  assert.deepEqual(choices.slice(0, MONEY_STARTERS.bills.length), [...MONEY_STARTERS.bills])
  assert.equal(choices.at(-2), "Lane")
  assert.equal(choices.at(-1), "Secret is not here")
  assert.equal(categoryChoices("cards", []).includes("Lane"), false)
  assert.equal(cleanCategory("<b>Rent</b>"), "Rent")
  assert.equal(cleanCategory("   "), null)
  assert.equal(cleanCategory("x".repeat(50))?.length, 40)
})

test("a long section closes only the long groups, and the choice is not a server rule", () => {
  assert.equal(defaultGroupOpen(12, 6), true)
  assert.equal(defaultGroupOpen(13, 5), true)
  assert.equal(defaultGroupOpen(13, 6), false)
})

test("subscription monthly line sums monthly records and does not divide yearly", () => {
  const rows = [
    { amount_cents: 4200, cadence: "month" as const },
    { amount_cents: 4200, cadence: null },
    { amount_cents: 12000, cadence: "year" as const },
  ]
  assert.equal(monthlySubscriptionCents(rows), 8400)
  assert.equal(monthlyLine(8400, "USD"), "$84 / month")
  assert.equal(subscriptionGroupTotal(rows), null)
  assert.equal(subscriptionGroupTotal(rows.slice(0, 2)), 8400)
  assert.equal(incomeGroupTotal([{ amount_cents: 100, spent_on: "2026-10-10" }, { amount_cents: 50, spent_on: "2026-09-01" }], "2026-10-02"), null)
  assert.equal(incomeGroupTotal([{ amount_cents: 100, spent_on: "2026-10-10" }], "2026-10-02"), 100)
})

test("card limit is a muted available line and stays blank when unset", () => {
  assert.equal(cardLimitLine(56000, 200000, "USD"), "$1,440 available · 28% used")
  assert.equal(cardLimitLine(250000, 200000, "USD"), "$0 available · 125% used")
  assert.equal(cardLimitLine(2500, null, "USD"), null)
  assert.equal(cardLimitLine(2500, undefined, "USD"), null)
})

test("a shared filter drops a just me amount from the group total", () => {
  const rows = [
    { id: "rent", category: "Housing", visibility: "shared" as const, left: 150000 },
    { id: "gym", category: "Housing", visibility: "private" as const, left: 3000 },
  ]
  const shared = applyVisibility(rows, "shared")
  const groups = groupMoney(
    "bills",
    shared,
    (row) => categoryGroupLabel("bills", row.category),
    (groupRows) => groupRows.reduce((sum, row) => sum + row.left, 0),
  )
  assert.equal(groups[0].totalCents, 150000)
  assert.equal(categoryChoices("bills", shared.map((row) => row.category)).includes("Gym fund"), false)
})

test("money group migration adds category, direction, and limit without new privileges", () => {
  const sql = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../../../supabase/migrations/20261003190000_money_groups.sql"),
    "utf8",
  )
  assert.match(sql, /add column category text/)
  assert.match(sql, /char_length\(category\) between 1 and 40/)
  assert.match(sql, /direction text not null default 'owe'/)
  assert.match(sql, /direction in \('owe', 'owed'\)/)
  assert.match(sql, /limit_cents integer/)
  assert.match(sql, /cadence text not null default 'month'/)
  assert.match(sql, /revoke update, truncate, references, trigger on table public\.money_payments/)
  assert.doesNotMatch(sql, /^\s*grant\b/im)
  assert.doesNotMatch(sql, /security definer/i)
  assert.doesNotMatch(sql, /create (or replace )?function/i)
  assert.doesNotMatch(sql, /create table/i)
  assert.doesNotMatch(sql, /service_role/)
  const records = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../actions/records.ts"), "utf8")
  function sliceFn(source: string, name: string) {
    const start = source.indexOf(`export async function ${name}`)
    assert.notEqual(start, -1, name)
    const next = source.indexOf("\nexport async function ", start + 10)
    return source.slice(start, next === -1 ? undefined : next)
  }
  for (const name of ["updateBill", "updateGoal", "updateExpense", "updateSubscription", "updateMoneyCard", "updateMoneyPerson"]) {
    const source = sliceFn(records, name)
    assert.doesNotMatch(source, /household_id|owner_id/)
  }
  assert.match(sliceFn(records, "createMoneyCard"), /limit_cents: limit\.cents/)
  assert.match(sliceFn(records, "createMoneyPerson"), /personDirection/)
  assert.doesNotMatch(sliceFn(records, "createMoneyPerson"), /activity_events/)
  assert.doesNotMatch(sliceFn(records, "createMoneyCard"), /activity_events/)
  for (const [name, section] of [
    ["createBill", "bills"],
    ["updateBill", "bills"],
    ["createGoal", "savings"],
    ["updateGoal", "savings"],
    ["createSubscription", "subscriptions"],
    ["updateSubscription", "subscriptions"],
    ["createMoneyCard", "cards"],
    ["updateMoneyCard", "cards"],
  ] as const) {
    assert.match(sliceFn(records, name), new RegExp(`categoryFor\\("${section}"`))
  }
  assert.match(sliceFn(records, "createExpense"), /categoryFor\("income"/)
  assert.match(sliceFn(records, "updateExpense"), /categoryFor\("income"/)
  assert.doesNotMatch(sliceFn(records, "createMoneyPerson"), /categoryFor|categoryToStore/)
  assert.doesNotMatch(sliceFn(records, "updateMoneyPerson"), /categoryFor|categoryToStore/)
  const matcher = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "category-match.ts"), "utf8")
  assert.doesNotMatch(matcher, /\bfetch\s*\(|supabase|https?:\/\//i)
  assert.match(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../components/money/category-field.tsx"), "utf8"), /category_mode/)
  assert.match(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../components/money/category-field.tsx"), "utf8"), /Card balances stay on Cards/)
  assert.match(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../components/money/money-groups.tsx"), "utf8"), /deanly-money-group-open/)
})
