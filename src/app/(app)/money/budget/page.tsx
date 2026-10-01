import type { Metadata } from "next"

import { MoneyBoard } from "@/components/records/section-board"
import { listExpenses } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Budget" }

export default async function Page() {
  const [clock, expenses] = await Promise.all([pageClock(), listExpenses("expense")])
  return (
    <MoneyBoard
      rows={expenses.rows}
      currency={expenses.currency}
      today={clock.today}
      visibility={expenses.visibility}
      budgetLabel="Shared spending counts toward the household budget."
      error={expenses.error}
    />
  )
}
