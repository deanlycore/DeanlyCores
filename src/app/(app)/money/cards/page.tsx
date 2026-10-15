import type { Metadata } from "next"

import { CardsBoard } from "@/components/money/balance-board"
import { listMoneyOverviewSources } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Cards" }

export default async function Page() {
  const [clock, money] = await Promise.all([pageClock(), listMoneyOverviewSources()])
  return (
    <CardsBoard
      rows={money.cards.rows}
      payments={money.payments.rows}
      currency={money.cards.currency}
      today={clock.today}
      error={money.cards.error || money.payments.error}
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
