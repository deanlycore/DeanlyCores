import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  SNAPSHOT_COPY,
  buildMoneySnapshot,
  moneyBillOpenHref,
  snapshotAvailable,
  snapshotMoney,
  type SnapshotBill,
} from "./snapshot.ts"

const today = "2026-10-02"
const root = dirname(fileURLToPath(import.meta.url))

function bill(partial: Partial<SnapshotBill> & Pick<SnapshotBill, "id" | "name" | "due_on">): SnapshotBill {
  return {
    amount_cents: 10000,
    paid_at: null,
    ...partial,
  }
}

test("available to spend uses this month’s expected income, leftover bills, contributions, renewals, and the buffer", () => {
  const model = buildMoneySnapshot({
    today,
    income: [
      { amount_cents: 200000, spent_on: "2026-10-10" },
      { amount_cents: 50000, spent_on: "2026-09-15" },
      { amount_cents: 40000, spent_on: "2026-10-01" },
      { amount_cents: 80000, spent_on: "2026-11-01" },
    ],
    bills: [
      bill({ id: "electric", name: "Electric", due_on: "2026-10-03", amount_cents: 12000 }),
      bill({ id: "rent", name: "Rent", due_on: "2026-11-01", amount_cents: 150000 }),
      bill({ id: "storage", name: "Storage", due_on: "2026-09-20", amount_cents: 9000 }),
      bill({ id: "internet", name: "Internet", due_on: "2026-10-08", amount_cents: 6000, paid_at: "2026-10-02T12:00:00Z" }),
    ],
    payments: [{ bill_id: "electric", amount_cents: 2000 }],
    goals: [{ contribution_cents: 15000 }, { contribution_cents: null }, {}],
    subscriptions: [
      { amount_cents: 4200, renews_on: "2026-10-12", active: true },
      { amount_cents: 12000, renews_on: "2026-12-01", active: true },
      { amount_cents: 9900, renews_on: "2026-10-20", active: false },
    ],
    bufferCents: 20000,
  })

  assert.equal(model.hasIncome, true)
  assert.equal(model.incomeCents, 200000)
  assert.equal(model.billsCents, 10000 + 9000)
  assert.equal(model.savingsState, "set")
  assert.equal(model.savingsCents, 15000)
  assert.equal(model.subscriptionsCents, 4200)
  assert.equal(model.bufferCents, 20000)
  assert.equal(model.availableCents, 200000 - 19000 - 15000 - 4200 - 20000)
  assert.equal(model.shortfall, false)
  assert.equal(snapshotAvailable(model.availableCents ?? 0, "USD"), "$1,418")
  assert.equal(snapshotMoney(model.billsCents, "USD", true), "−$190")
})

test("a just me row in the readable list stays in the number", () => {
  const model = buildMoneySnapshot({
    today,
    income: [{ amount_cents: 18000, spent_on: "2026-10-25" }],
    bills: [bill({ id: "gym", name: "Gym", due_on: "2026-10-06", amount_cents: 3000 })],
    payments: [],
    goals: [{ contribution_cents: 5000 }],
    subscriptions: [{ amount_cents: 4200, renews_on: "2026-10-20", active: true }],
    bufferCents: 0,
  })
  assert.equal(model.availableCents, 18000 - 3000 - 5000 - 4200)
})

test("no expected income hides the dollar answer and still reports the other lines", () => {
  const model = buildMoneySnapshot({
    today,
    income: [{ amount_cents: 240000, spent_on: "2026-09-28" }],
    bills: [],
    payments: [],
    goals: [],
    subscriptions: [],
    bufferCents: 0,
  })
  assert.equal(model.hasIncome, false)
  assert.equal(model.availableCents, null)
  assert.equal(model.shortfall, false)
  assert.equal(model.hasBills, false)
  assert.equal(model.billsCents, 0)
  assert.equal(model.savingsState, "none")
  assert.equal(model.hasSubscriptions, false)
  assert.equal(SNAPSHOT_COPY.addIncome, "Add income to see what’s left.")
})

test("a negative result stays a number and names the shortfall", () => {
  const model = buildMoneySnapshot({
    today,
    income: [{ amount_cents: 10000, spent_on: "2026-10-20" }],
    bills: [bill({ id: "rent", name: "Rent", due_on: "2026-10-28", amount_cents: 150000 })],
    payments: [],
    goals: [],
    subscriptions: [],
    bufferCents: 0,
  })
  assert.equal(model.availableCents, 10000 - 150000)
  assert.equal(model.shortfall, true)
  assert.equal(snapshotAvailable(model.availableCents ?? 0, "USD"), "−$1,400")
  assert.equal(SNAPSHOT_COPY.shortfall, "Bills are higher than expected income.")
})

test("savings without a contribution subtracts nothing and says so", () => {
  const unset = buildMoneySnapshot({
    today,
    income: [{ amount_cents: 50000, spent_on: "2026-10-15" }],
    bills: [],
    payments: [],
    goals: [
      { contribution_cents: null, target_cents: 100000, current_cents: 40000 },
      { target_cents: 50000, current_cents: 15000 },
    ],
    subscriptions: [],
    bufferCents: 0,
  })
  assert.equal(unset.savingsState, "unset")
  assert.equal(unset.savingsCents, 0)
  assert.equal(unset.availableCents, 50000)
  assert.equal(SNAPSHOT_COPY.noContribution, "No contribution set.")

  const none = buildMoneySnapshot({
    today,
    income: [],
    bills: [],
    payments: [],
    goals: [],
    subscriptions: [],
    bufferCents: 0,
  })
  assert.equal(none.savingsState, "none")
  assert.equal(SNAPSHOT_COPY.noneYet, "None yet")
})

test("a yearly renewal counts only in its own month and is not divided", () => {
  const later = buildMoneySnapshot({
    today,
    income: [{ amount_cents: 100000, spent_on: "2026-10-12" }],
    bills: [],
    payments: [],
    goals: [],
    subscriptions: [{ amount_cents: 12000, renews_on: "2026-12-01", active: true }],
    bufferCents: 0,
  })
  assert.equal(later.hasSubscriptions, false)
  assert.equal(later.subscriptionsCents, 0)
  assert.equal(later.availableCents, 100000)

  const thisMonth = buildMoneySnapshot({
    today,
    income: [{ amount_cents: 100000, spent_on: "2026-10-12" }],
    bills: [],
    payments: [],
    goals: [],
    subscriptions: [{ amount_cents: 12000, renews_on: "2026-10-18", active: true }],
    bufferCents: 0,
  })
  assert.equal(thisMonth.subscriptionsCents, 12000)
  assert.equal(thisMonth.availableCents, 88000)
})

test("attention is bills only, keeps the bill’s due line, and caps at three overdue first", () => {
  const model = buildMoneySnapshot({
    today,
    income: [],
    payments: [{ bill_id: "electric", amount_cents: 2000 }],
    goals: [],
    subscriptions: [],
    bufferCents: 0,
    bills: [
      bill({ id: "old", name: "Storage", due_on: "2026-09-01", amount_cents: 9100 }),
      bill({ id: "older", name: "Water", due_on: "2026-08-01", amount_cents: 4000 }),
      bill({ id: "oldest", name: "Gas", due_on: "2026-07-01", amount_cents: 3000 }),
      bill({ id: "ancient", name: "Tax", due_on: "2026-06-01", amount_cents: 2000 }),
      bill({ id: "electric", name: "Electric", due_on: "2026-10-03", amount_cents: 12000 }),
      bill({ id: "today", name: "Phone", due_on: today, amount_cents: 4500 }),
      bill({ id: "gym", name: "Gym", due_on: "2026-10-06", amount_cents: 3000 }),
      bill({ id: "week", name: "Insurance", due_on: "2026-10-09", amount_cents: 8000 }),
      bill({ id: "later", name: "Truck", due_on: "2026-10-13", amount_cents: 41700 }),
      bill({ id: "paid", name: "Internet", due_on: "2026-10-01", amount_cents: 6000, paid_at: "2026-10-02T12:00:00Z" }),
    ],
  })

  assert.deepEqual(
    model.attention.map((row) => [row.name, row.due, row.urgent, row.leftCents]),
    [
      ["Tax", "Overdue", true, 2000],
      ["Gas", "Overdue", true, 3000],
      ["Water", "Overdue", true, 4000],
    ],
  )

  const soon = buildMoneySnapshot({
    today,
    income: [],
    bills: [
      bill({ id: "electric", name: "Electric", due_on: "2026-10-03", amount_cents: 12000 }),
      bill({ id: "phone", name: "Phone", due_on: today, amount_cents: 4500 }),
      bill({ id: "gym", name: "Gym", due_on: "2026-10-06", amount_cents: 3000 }),
      bill({ id: "edge", name: "Insurance", due_on: "2026-10-09", amount_cents: 8000 }),
      bill({ id: "truck", name: "Truck", due_on: "2026-10-10", amount_cents: 41700 }),
    ],
    payments: [{ bill_id: "electric", amount_cents: 2000 }],
    goals: [],
    subscriptions: [],
    bufferCents: 0,
  })
  assert.deepEqual(
    soon.attention.map((row) => [row.name, row.due, row.urgent, row.leftCents]),
    [
      ["Phone", "Due today", true, 4500],
      ["Electric", "Due in 1 day", true, 10000],
      ["Gym", "Due in 4 days", false, 3000],
    ],
  )
  assert.equal(soon.attention.some((row) => row.due === "Due tomorrow"), false)
  assert.equal(soon.attention.find((row) => row.name === "Insurance")?.due, undefined)
})

test("a bill opening stays on the money surface that can show it", () => {
  assert.equal(moneyBillOpenHref("/money", "electric"), "/money?bill=electric")
  assert.equal(moneyBillOpenHref("/money/income", "electric"), "/money/bills?bill=electric")
  assert.equal(moneyBillOpenHref("/preview/money", "electric"), "/preview/money?bill=electric")
  assert.equal(moneyBillOpenHref("/preview/money/savings", "a b"), "/preview/money/bills?bill=a%20b")
})

test("a zero balance never formats as negative zero", () => {
  assert.equal(snapshotMoney(0, "USD", true), "$0")
  assert.equal(snapshotMoney(-0, "USD", true), "$0")
  assert.equal(snapshotAvailable(0, "USD"), "$0")
  assert.equal(snapshotAvailable(-0, "USD"), "$0")
  assert.equal(snapshotMoney(5000, "USD", true), "−$50")
  assert.equal(snapshotAvailable(-5000, "USD"), "−$50")
})

test("the overview sits on the bills page between the toggle and the chips", () => {
  const snapshot = readFileSync(join(root, "../../components/money/money-snapshot.tsx"), "utf8")
  const overview = readFileSync(join(root, "../../components/money/money-overview.tsx"), "utf8")
  const scan = readFileSync(join(root, "../../components/money/money-scan.tsx"), "utf8")
  const bills = readFileSync(join(root, "../../components/money/bills-board.tsx"), "utf8")
  const frame = readFileSync(join(root, "../../components/money/money-chrome.tsx"), "utf8")
  const billsPage = readFileSync(join(root, "../../app/(app)/money/bills/page.tsx"), "utf8")
  const title = bills.indexOf('title="Bills"')
  const toggle = bills.indexOf("onFilter={setFilter}")
  const card = bills.indexOf("<MoneyOverview")
  const chips = bills.indexOf("due this week")
  const dueCard = bills.indexOf('title="Due this week"')
  const header = frame.indexOf("<header")
  const frameToggle = frame.indexOf("<VisibilityFilter")
  const frameOverview = frame.indexOf("{overview}")
  const frameChips = frame.indexOf("{chips ?")
  assert.ok(title >= 0 && title < toggle && toggle < card && card < chips && chips < dueCard)
  assert.ok(header < frameToggle && frameToggle < frameOverview && frameOverview < frameChips)
  assert.match(bills, /applyVisibility\(income, filter\)/)
  assert.match(billsPage, /listGoals\(\)/)
  assert.match(billsPage, /listSubscriptions\(\)/)
  assert.match(billsPage, /listMoneyCards\(\)/)
  assert.match(billsPage, /listMoneyPeople\(\)/)
  const scanToggle = scan.indexOf("<VisibilityFilter")
  const scanCard = scan.indexOf("<MoneyOverview")
  const scanPills = scan.indexOf("<SectionSegments")
  const scanIncome = scan.indexOf('section === "income"')
  assert.ok(scanToggle < scanCard && scanCard < scanPills && scanPills < scanIncome)
  assert.match(scan, /section === "bills" \? \(\s*<MoneyOverview/)
  assert.equal(scan.split("<MoneyOverview").length, 2)
  for (const file of ["income-board.tsx", "savings-board.tsx", "subscriptions-board.tsx", "balance-board.tsx"]) {
    assert.doesNotMatch(readFileSync(join(root, "../../components/money", file), "utf8"), /MoneyOverview/)
  }
  assert.doesNotMatch(scan, /useMoneyVisibility/)
  assert.match(snapshot, /localStorage/)
  assert.match(snapshot, /SAFETY_BUFFER_KEY/)
  assert.doesNotMatch(snapshot, /supabase|service_role|from\(|useMoneyVisibility|applyVisibility|safe to spend|all caught up|bank/i)
  assert.match(snapshot, /text-ink/)
  assert.doesNotMatch(snapshot, /text-danger[^"]*data-available|data-available[^"]*text-danger/)
  assert.match(snapshot, /SNAPSHOT_COPY\.addIncome/)
  assert.match(snapshot, /size-1\.5/)
  assert.match(overview, /aria-pressed=\{active\}/)
  assert.match(overview, /aria-controls="money-overview-panel"/)
  assert.match(overview, /role="region"/)
  assert.match(overview, /useState<OverviewPanel \| null>\(null\)/)
  assert.match(overview, /panel === "spend" \? <MoneyAvailablePanel/)
  assert.match(overview, /panel === "attention" \? <MoneyAttentionPanel/)
  assert.doesNotMatch(overview, /localStorage|ChevronDown|#[0-9a-fA-F]{3,8}/)
  assert.match(overview, /grid-cols-2 gap-2 lg:grid-cols-4/)
  assert.match(overview, /min-h-16/)
  assert.match(overview, /bg-brand-soft/)
  assert.match(overview, /text-brand-deep/)
  assert.match(overview, /truncate text-\[15px\] font-medium tabular-nums/)
  assert.match(snapshot, /leading-normal/)
  assert.doesNotMatch(snapshot, /leading-tight/)
  assert.match(snapshot, /savingsState === "unset"[\s\S]*SNAPSHOT_COPY\.noContribution[\s\S]*SNAPSHOT_COPY\.noneYet/)
  assert.doesNotMatch(snapshot, /Missing note=\{SNAPSHOT_COPY\.noneYet\} currency=\{currency\} \/>\s*\)\}\s*<\/Line>\s*<Line label=\{SNAPSHOT_COPY\.subscriptions\}/)
})
