import { notFound } from "next/navigation"

import { MoneyScan } from "@/components/money/money-scan"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import type { BillRow, ExpenseRow, MoneyCardRow, MoneyPaymentRow, MoneyPersonRow, SubscriptionRow } from "@/lib/data/home"
import { primaryNav, railChildren } from "@/lib/navigation"

import { previewSession } from "../shell-session"

export const dynamic = "force-dynamic"

const today = "2026-10-02"

const bills: BillRow[] = [
  { id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", paid_at: null, visibility: "shared" },
  { id: "gym", name: "Gym", amount_cents: 3000, due_on: "2026-10-06", paid_at: null, visibility: "private" },
]

const income: ExpenseRow[] = [
  { id: "paycheck", name: "Paycheck", amount_cents: 240000, kind: "income", spent_on: "2026-10-10", visibility: "shared" },
]

const subscriptions: SubscriptionRow[] = [
  { id: "music", name: "Music", amount_cents: 1199, renews_on: "2026-10-12", active: true, visibility: "shared" },
]

const cards: MoneyCardRow[] = [
  { id: "visa", name: "Household visa", amount_cents: 64000, due_on: "2026-10-18", note: null, visibility: "private" },
]

const people: MoneyPersonRow[] = [
  { id: "alex", name: "Alex", amount_cents: 6000, due_on: null, note: "tickets", visibility: "private" },
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

export default function PreviewMoney() {
  if (process.env.NODE_ENV === "production") notFound()
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-5">
        {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
        <MoneyScan
          today={today}
          currency="USD"
          bills={bills}
          income={income}
          goals={[]}
          subscriptions={subscriptions}
          cards={cards}
          people={people}
          payments={payments}
        />
      </div>
    </AppShell>
  )
}
