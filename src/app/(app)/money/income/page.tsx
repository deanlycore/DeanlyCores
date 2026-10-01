import type { Metadata } from "next"

import { LedgerBoard } from "@/components/records/section-board"
import { listExpenses } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Income" }

export default async function Page() {
  const [clock, income] = await Promise.all([pageClock(), listExpenses("income")])
  return (
    <LedgerBoard
      title="Income"
      body="Pay and other money coming in."
      kind="income"
      rows={income.rows}
      currency={income.currency}
      today={clock.today}
      visibility={income.visibility}
      error={income.error}
    />
  )
}
