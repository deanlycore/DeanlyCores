import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { INSIGHTS_COPY, buildMoneyInsights, insightText, type InsightBill, type MoneyInsight } from "./insights.ts"

const today = "2026-10-02"
const root = dirname(fileURLToPath(import.meta.url))

function bill(partial: Partial<InsightBill> & Pick<InsightBill, "id" | "name">): InsightBill {
  return {
    amount_cents: 10000,
    due_on: "2026-10-20",
    paid_at: null,
    ...partial,
  }
}

function linesOf(input: Parameters<typeof buildMoneyInsights>[0]) {
  return buildMoneyInsights(input).map(insightText)
}

function base(overrides: Partial<Parameters<typeof buildMoneyInsights>[0]> = {}) {
  return {
    today,
    currency: "USD",
    bills: [] as InsightBill[],
    payments: [],
    income: [],
    goals: [],
    subscriptions: [],
    cards: [],
    people: [],
    ...overrides,
  }
}

test("sample rows keep the first three lines and leave the rest off the card", () => {
  const lines = linesOf(
    base({
      bills: [
        bill({ id: "rent", name: "Rent", amount_cents: 150000, due_on: "2026-11-01", category: "Housing" }),
        bill({ id: "mortgage", name: "Mortgage insurance", amount_cents: 12000, due_on: "2026-10-18", category: "Housing" }),
        bill({ id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", category: "Utilities" }),
        bill({ id: "water", name: "Water", amount_cents: 6500, due_on: "2026-10-11", category: "Utilities" }),
        bill({ id: "truck", name: "Truck payment", amount_cents: 41700, due_on: "2026-10-13", category: "Debt & Loans" }),
        bill({ id: "gym", name: "Gym", amount_cents: 3000, due_on: "2026-10-06", category: null }),
      ],
      income: [
        { id: "paycheck", name: "Paycheck", amount_cents: 240000, spent_on: "2026-10-10", category: "Primary Income" },
        { id: "side", name: "Side work", amount_cents: 18000, spent_on: "2026-10-25", category: "Freelance / Business" },
      ],
      subscriptions: [
        { id: "music", name: "Music", amount_cents: 4200, renews_on: "2026-10-12", active: true, category: "Music", cadence: "month" },
        { id: "shows", name: "Shows", amount_cents: 4200, renews_on: "2026-10-20", active: true, category: "Streaming", cadence: "month" },
        { id: "domain", name: "Domain", amount_cents: 12000, renews_on: "2026-12-01", active: true, category: "Technology", cadence: "year" },
      ],
      cards: [
        { id: "visa", name: "Household visa", amount_cents: 64000, due_on: "2026-10-18", category: "Credit Cards" },
      ],
      goals: [
        { id: "emergency", name: "Emergency fund", category: "Emergency Fund" },
      ],
    }),
  )

  assert.deepEqual(lines, [
    "2 bills are due in the next 7 days, $150 total.",
    "Primary Income is your biggest group this month, $2,400.",
    "Subscriptions add up to $84 a month.",
  ])
})

test("one bill uses the singular sentence and a payment reduces the total", () => {
  const lines = linesOf(
    base({
      today: "2026-10-28",
      bills: [
        bill({ id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-11-02" }),
        bill({ id: "overdue", name: "Storage", amount_cents: 9000, due_on: "2026-09-20" }),
        bill({ id: "paid", name: "Internet", amount_cents: 6000, due_on: "2026-10-30", paid_at: "2026-10-02T12:00:00Z" }),
      ],
      payments: [{ bill_id: "electric", card_id: null, person_id: null, amount_cents: 2000 }],
    }),
  )
  assert.deepEqual(lines, ["1 bill is due in the next 7 days, $100 total."])
})

test("a bill seven days out counts, and one eight days out does not", () => {
  const inside = linesOf(
    base({
      today: "2026-10-28",
      bills: [bill({ id: "rent", name: "Rent", amount_cents: 150000, due_on: "2026-11-04" })],
    }),
  )
  const outside = linesOf(
    base({
      today: "2026-10-02",
      bills: [bill({ id: "edge", name: "Insurance", amount_cents: 8000, due_on: "2026-10-10", category: "Insurance" })],
    }),
  )
  assert.deepEqual(inside, ["1 bill is due in the next 7 days, $1,500 total."])
  assert.equal(outside.some((line) => line.includes("next 7 days")), false)
  assert.deepEqual(outside, ["Insurance is your biggest group this month, $80."])
})

test("the biggest group is this month, and a tied amount follows section order", () => {
  const lines = buildMoneyInsights(
    base({
      income: [
        { id: "old", name: "Paycheck", amount_cents: 900000, spent_on: "2026-09-15", category: "Primary Income" },
        { id: "side", name: "Side work", amount_cents: 18500, spent_on: "2026-10-25", category: "Freelance / Business" },
      ],
      bills: [
        bill({ id: "water", name: "Water", amount_cents: 18500, due_on: "2026-10-11", category: "Utilities" }),
        bill({ id: "rent", name: "Rent", amount_cents: 150000, due_on: "2026-11-01", category: "Housing" }),
      ],
      goals: [{ id: "emergency", name: "Emergency fund", category: "Emergency Fund", contribution_cents: null }],
    }),
  )
  assert.equal(insightText(lines[0]), "Utilities is your biggest group this month, $185.")
  assert.equal(lines[0].parts.find((part) => part.amount)?.text, "$185")
})

test("a goal balance is not a group, and a contribution this month can be", () => {
  const balance = linesOf(
    base({
      goals: [{ id: "emergency", name: "Emergency fund", category: "Emergency Fund" }],
    }),
  )
  const contribution = linesOf(
    base({
      goals: [{ id: "emergency", name: "Emergency fund", category: "Emergency Fund", contribution_cents: 15000 }],
    }),
  )
  assert.deepEqual(balance, [])
  assert.deepEqual(contribution, ["Emergency Fund is your biggest group this month, $150."])
})

test("subscriptions use the monthly price, skip yearly and inactive, and ignore a zero", () => {
  const lines = linesOf(
    base({
      subscriptions: [
        { id: "music", name: "Music", amount_cents: 1099, renews_on: "2026-12-02", active: true, cadence: "month" },
        { id: "domain", name: "Domain", amount_cents: 12000, renews_on: "2026-12-01", active: true, cadence: "year" },
        { id: "news", name: "News", amount_cents: 500, renews_on: "2026-10-08", active: false, cadence: "month" },
      ],
    }),
  )
  assert.deepEqual(lines, ["Subscriptions add up to $10.99 a month."])
})

test("one undated bill is singular, and a dated bill is not counted there", () => {
  const one = linesOf(base({ bills: [bill({ id: "misc", name: "Misc", amount_cents: 2500, due_on: null })] }))
  const many = linesOf(
    base({
      bills: [
        bill({ id: "misc", name: "Misc", amount_cents: 2500, due_on: "" }),
        bill({ id: "other", name: "Other", amount_cents: 1000, due_on: null }),
        bill({ id: "dated", name: "Electric", amount_cents: 12000, due_on: "2026-10-20" }),
        bill({ id: "paid", name: "Old", amount_cents: 4000, due_on: null, paid_at: "2026-10-01T00:00:00Z" }),
      ],
    }),
  )
  assert.deepEqual(one, ["1 bill doesn’t have a due date yet."])
  assert.ok(many.includes("2 bills don’t have a due date yet."))
  assert.equal(many.filter((line) => line.includes("due date")).length, 1)
})

test("income covers this month’s bills, and a higher bill uses the shortfall sentence", () => {
  const spare = linesOf(
    base({
      income: [{ id: "paycheck", name: "Paycheck", amount_cents: 200000, spent_on: "2026-10-10" }],
      bills: [
        bill({ id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-20" }),
        bill({ id: "old", name: "Storage", amount_cents: 300000, due_on: "2026-09-01" }),
      ],
      subscriptions: [
        { id: "music", name: "Music", amount_cents: 4200, renews_on: "2026-10-12", active: true, cadence: "month" },
      ],
    }),
  )
  const short = linesOf(
    base({
      income: [
        { id: "past", name: "Paycheck", amount_cents: 900000, spent_on: "2026-10-01" },
        { id: "next", name: "Paycheck", amount_cents: 10000, spent_on: "2026-10-20" },
      ],
      bills: [bill({ id: "rent", name: "Rent", amount_cents: 150000, due_on: "2026-10-28" })],
    }),
  )
  const even = linesOf(
    base({
      income: [{ id: "paycheck", name: "Paycheck", amount_cents: 12000, spent_on: "2026-10-10" }],
      bills: [bill({ id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-20" })],
    }),
  )
  const noIncome = linesOf(
    base({
      bills: [bill({ id: "rent", name: "Rent", amount_cents: 150000, due_on: "2026-10-28" })],
    }),
  )

  assert.equal(spare[1], "Subscriptions add up to $42 a month.")
  assert.equal(spare[2], "Income covers bills with $1,880 to spare.")
  assert.equal(short.at(-1), INSIGHTS_COPY.shortfall)
  assert.equal(even.some((line) => line.includes("to spare") || line === INSIGHTS_COPY.shortfall), false)
  assert.equal(even.some((line) => line.includes("$0")), false)
  assert.equal(noIncome.some((line) => line === INSIGHTS_COPY.shortfall || line.includes("to spare")), false)
})

test("a private row in the readable list is counted, and an empty list says nothing", () => {
  const lines = linesOf(
    base({
      bills: [bill({ id: "gym", name: "Gym", amount_cents: 3000, due_on: "2026-10-06" })],
    }),
  )
  assert.equal(lines[0], "1 bill is due in the next 7 days, $30 total.")
  assert.deepEqual(linesOf(base()), [])
})

test("the card keeps three lines when later lines also apply", () => {
  const lines = buildMoneyInsights(
    base({
      bills: [
        bill({ id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", category: "Utilities" }),
        bill({ id: "misc", name: "Misc", amount_cents: 2500, due_on: null }),
      ],
      income: [{ id: "paycheck", name: "Paycheck", amount_cents: 200000, spent_on: "2026-10-10", category: "Primary Income" }],
      subscriptions: [
        { id: "music", name: "Music", amount_cents: 4200, renews_on: "2026-10-12", active: true, cadence: "month" },
      ],
    }),
  )
  assert.deepEqual(
    lines.map((line: MoneyInsight) => line.id),
    ["soon", "group", "subscriptions"],
  )
  assert.equal(lines.length, 3)
})

test("insights stay inside the overview and on rows the bills page already loads", () => {
  const page = readFileSync(join(root, "../../app/(app)/money/bills/page.tsx"), "utf8")
  const layout = readFileSync(join(root, "../../app/(app)/money/layout.tsx"), "utf8")
  const preview = readFileSync(join(root, "../../app/preview/money/bills/page.tsx"), "utf8")
  const scan = readFileSync(join(root, "../../components/money/money-scan.tsx"), "utf8")
  const view = readFileSync(join(root, "../../components/money/money-insights.tsx"), "utf8")
  const overview = readFileSync(join(root, "../../components/money/money-overview.tsx"), "utf8")
  const lib = readFileSync(join(root, "insights.ts"), "utf8")
  const migrations = readFileSync(join(root, "../../../supabase/migrations/20261003190000_money_groups.sql"), "utf8")

  assert.match(overview, /const insights = buildMoneyInsights\(/)
  assert.match(overview, /panel === "insights" \? <MoneyInsightsPanel/)
  assert.match(overview, /buildMoneyInsights/)
  assert.match(page, /listBills\(\)/)
  assert.match(page, /listMoneyPeople\(\)/)
  assert.doesNotMatch(page, /\.rpc\(|\.from\(|head:\s*true|count:\s*["']exact["']/)
  assert.doesNotMatch(layout, /\.rpc\(|\.from\(|head:\s*true|count:\s*["']exact["']/)
  assert.doesNotMatch(preview, /\.rpc\(|supabase/)
  assert.match(preview, /<BillsBoard/)
  assert.match(scan, /<ScopedMoneyOverview/)
  assert.ok(scan.indexOf("<ScopedMoneyOverview") < scan.indexOf('section === "income"'))
  const incomePage = readFileSync(join(root, "../../app/(app)/money/income/page.tsx"), "utf8")
  const peoplePage = readFileSync(join(root, "../../app/(app)/money/people/page.tsx"), "utf8")
  assert.match(incomePage, /listMoneyOverviewSources\(\)/)
  assert.match(peoplePage, /listMoneyOverviewSources\(\)/)
  assert.doesNotMatch(incomePage, /\.rpc\(|\.from\(/)
  assert.match(view, /text-\[15px\]/)
  assert.match(view, /tabular-nums/)
  assert.match(view, /border-t border-border/)
  assert.match(view, /INSIGHTS_COPY\.empty/)
  assert.doesNotMatch(view, /text-danger|text-success|text-warn|text-red|bg-danger|recharts|<svg|chart|localStorage|ChevronDown/)
  assert.doesNotMatch(view, /great job|watch out|overspending|safe to spend/i)
  assert.doesNotMatch(lib, /great job|watch out|overspending|safe to spend/i)
  assert.doesNotMatch(lib, /supabase|\.rpc\(|\.from\(|migration|localStorage|last month|month over month/i)
  assert.doesNotMatch(migrations, /insight/i)
  assert.equal(INSIGHTS_COPY.title, "Insights")
  assert.equal(INSIGHTS_COPY.empty, "Not enough tracked yet.")
  assert.equal(INSIGHTS_COPY.shortfall, "Bills are higher than expected income.")
})
