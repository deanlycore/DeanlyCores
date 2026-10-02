import type { Metadata } from "next"

import { IncomeBoard } from "@/components/money/income-board"
import { getSessionView } from "@/lib/data/session"
import { listExpenses } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Income" }

export default async function Page() {
  const [clock, income, session] = await Promise.all([pageClock(), listExpenses("income"), getSessionView()])
  return (
    <IncomeBoard
      rows={income.rows}
      currency={income.currency}
      today={clock.today}
      householdName={session.householdName}
      error={income.error}
    />
  )
}
