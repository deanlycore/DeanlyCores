import type { Metadata } from "next"

import { SavingsBoard } from "@/components/money/savings-board"
import { getSessionView } from "@/lib/data/session"
import { listMoneyOverviewSources } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Savings" }

export default async function Page() {
  const [clock, money, session] = await Promise.all([pageClock(), listMoneyOverviewSources(), getSessionView()])
  return (
    <SavingsBoard
      rows={money.goals.rows}
      currency={money.goals.currency}
      today={clock.today}
      householdName={session.householdName}
      error={money.goals.error}
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
