import { notFound } from "next/navigation"

import { MoneyFlow } from "@/components/money/money-flow"
import { MoneyScan } from "@/components/money/money-scan"
import { MoneySnapshot } from "@/components/money/money-snapshot"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import type { BillRow, ExpenseRow, GoalRow, MoneyCardRow, MoneyPaymentRow, MoneyPersonRow, SubscriptionRow } from "@/lib/data/home"
import { moneyScanSection } from "@/lib/money/board"
import { primaryNav, railChildren } from "@/lib/navigation"

import { previewSession } from "../shell-session"

export const dynamic = "force-dynamic"

const today = "2026-10-02"

const bills: BillRow[] = [
  { id: "rent", name: "Rent", amount_cents: 150000, due_on: "2026-11-01", paid_at: null, visibility: "shared", category: "Housing" },
  { id: "mortgage", name: "Mortgage insurance", amount_cents: 12000, due_on: "2026-10-18", paid_at: null, visibility: "shared", category: "Housing" },
  { id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", paid_at: null, visibility: "shared", category: "Utilities" },
  { id: "water", name: "Water", amount_cents: 6500, due_on: "2026-10-11", paid_at: null, visibility: "shared", category: "Utilities" },
  { id: "truck", name: "Truck payment", amount_cents: 41700, due_on: "2026-10-13", paid_at: null, visibility: "shared", category: "Debt & Loans" },
  { id: "gym", name: "Gym", amount_cents: 3000, due_on: "2026-10-06", paid_at: null, visibility: "private", category: null },
]

const income: ExpenseRow[] = [
  { id: "paycheck", name: "Paycheck", amount_cents: 240000, kind: "income", spent_on: "2026-10-10", visibility: "shared", category: "Primary Income" },
  { id: "side", name: "Side work", amount_cents: 18000, kind: "income", spent_on: "2026-10-25", visibility: "private", category: "Freelance / Business" },
]

const goals: GoalRow[] = [
  { id: "emergency", name: "Emergency fund", target_cents: 100000, current_cents: 40000, visibility: "shared", category: "Emergency Fund" },
  { id: "beach", name: "Beach week", target_cents: 50000, current_cents: 15000, visibility: "private", category: "Vacation" },
]

const subscriptions: SubscriptionRow[] = [
  { id: "music", name: "Music", amount_cents: 4200, renews_on: "2026-10-12", active: true, visibility: "shared", category: "Music", cadence: "month" },
  { id: "shows", name: "Shows", amount_cents: 4200, renews_on: "2026-10-20", active: true, visibility: "private", category: "Streaming", cadence: "month" },
  { id: "domain", name: "Domain", amount_cents: 12000, renews_on: "2026-12-01", active: true, visibility: "shared", category: "Technology", cadence: "year" },
]

const cards: MoneyCardRow[] = [
  { id: "visa", name: "Household visa", amount_cents: 64000, due_on: "2026-10-18", note: null, visibility: "private", category: "Credit Cards", limit_cents: 200000 },
  { id: "debit", name: "Everyday debit", amount_cents: 2500, due_on: null, note: null, visibility: "private", category: "Debit Cards", limit_cents: null },
]

const people: MoneyPersonRow[] = [
  { id: "alex", name: "Alex", amount_cents: 6000, due_on: null, note: "tickets", visibility: "private", direction: "owe" },
  { id: "jordan", name: "Jordan", amount_cents: 2500, due_on: null, note: null, visibility: "private", direction: "owed" },
]

const payments: MoneyPaymentRow[] = [
  {
    id: "pay-alex",
    bill_id: null,
    card_id: null,
    person_id: "alex",
    amount_cents: 2000,
    paid_on: "2026-09-28",
    note: null,
  },
]

export default async function PreviewMoney({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[]; sample?: string | string[] }>
}) {
  if (process.env.NODE_ENV === "production") notFound()
  const params = await searchParams
  const selected = moneyScanSection(params.section)
  const sample = Array.isArray(params.sample) ? params.sample[0] : params.sample
  const shownIncome = sample === "no-income" ? [] : income
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <AppShell session={previewSession}>
      <div>
        <div className="mb-4 md:mb-5 grid gap-4 md:gap-5">
          <MoneySnapshot
            today={today}
            currency="USD"
            bills={bills}
            payments={payments}
            income={shownIncome}
            goals={goals}
            subscriptions={subscriptions}
          />
          <MoneyFlow
            today={today}
            currency="USD"
            bills={bills}
            payments={payments}
            income={shownIncome}
            goals={goals}
            subscriptions={subscriptions}
            cards={cards}
            people={people}
          />
        </div>
        <div className="grid gap-5">
          {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" section={selected} /> : null}
          <MoneyScan
            section={selected}
            today={today}
            currency="USD"
            bills={bills}
            income={shownIncome}
            goals={goals}
            subscriptions={subscriptions}
            cards={cards}
            people={people}
            payments={payments}
          />
        </div>
      </div>
    </AppShell>
  )
}
