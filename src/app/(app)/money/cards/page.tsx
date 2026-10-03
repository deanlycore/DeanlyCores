import type { Metadata } from "next"

import { CardsBoard } from "@/components/money/balance-board"
import { listMoneyCards, listMoneyPayments } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Cards" }

export default async function Page() {
  const [clock, cards, payments] = await Promise.all([pageClock(), listMoneyCards(), listMoneyPayments()])
  return (
    <CardsBoard
      rows={cards.rows}
      payments={payments.rows}
      currency={cards.currency}
      today={clock.today}
      error={cards.error || payments.error}
    />
  )
}
