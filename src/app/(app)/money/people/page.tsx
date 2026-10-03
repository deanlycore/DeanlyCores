import type { Metadata } from "next"

import { PeopleBoard } from "@/components/money/balance-board"
import { listMoneyPayments, listMoneyPeople } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "People" }

export default async function Page() {
  const [clock, people, payments] = await Promise.all([pageClock(), listMoneyPeople(), listMoneyPayments()])
  return (
    <PeopleBoard
      rows={people.rows}
      payments={payments.rows}
      currency={people.currency}
      today={clock.today}
      error={people.error || payments.error}
    />
  )
}
