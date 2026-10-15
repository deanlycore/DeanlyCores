import type { Metadata } from "next"

import { SubscriptionsBoard } from "@/components/money/subscriptions-board"
import { getSessionView } from "@/lib/data/session"
import { listMoneyOverviewSources } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Subscriptions" }

export default async function Page() {
  const [clock, money, session] = await Promise.all([pageClock(), listMoneyOverviewSources(), getSessionView()])
  return (
    <SubscriptionsBoard
      rows={money.subscriptions.rows}
      currency={money.subscriptions.currency}
      today={clock.today}
      householdName={session.householdName}
      error={money.subscriptions.error}
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
