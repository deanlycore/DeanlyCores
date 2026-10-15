import type { Metadata } from "next"

import { IncomeBoard } from "@/components/money/income-board"
import { getSessionView } from "@/lib/data/session"
import { listMoneyOverviewSources } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Income" }

export default async function Page() {
  const [clock, money, session] = await Promise.all([pageClock(), listMoneyOverviewSources(), getSessionView()])
  return (
    <IncomeBoard
      rows={money.income.rows}
      currency={money.income.currency}
      today={clock.today}
      householdName={session.householdName}
      error={money.income.error}
      overview={{
        bills: money.bills.rows,
        payments: money.payments.rows,
        income: money.income.rows,
        goals: money.goals.rows,
        subscriptions: money.subscriptions.rows,
        cards: money.cards.rows,
        people: money.people.rows,
      }}
    />
  )
}
