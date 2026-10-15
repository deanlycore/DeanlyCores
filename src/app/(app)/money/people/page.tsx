import type { Metadata } from "next"

import { PeopleBoard } from "@/components/money/balance-board"
import { listMoneyOverviewSources } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "People" }

export default async function Page() {
  const [clock, money] = await Promise.all([pageClock(), listMoneyOverviewSources()])
  return (
    <PeopleBoard
      rows={money.people.rows}
      payments={money.payments.rows}
      currency={money.people.currency}
      today={clock.today}
      error={money.people.error || money.payments.error}
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
