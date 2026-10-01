import type { Metadata } from "next"

import { MoneyBoard } from "@/components/records/section-board"
import { loadHome } from "@/lib/data/home"
import { listExpenses } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"
import { formatMoney } from "@/lib/home/metrics"

export const metadata: Metadata = { title: "Money" }

export default async function Page() {
  const clock = await pageClock()
  const [home, expenses] = await Promise.all([loadHome(clock.timeZone), listExpenses("expense")])
  const budgetLabel = home?.budget
    ? `${formatMoney(home.budget.amountCents, expenses.currency)} set for this month.`
    : "Set a monthly budget when you’re ready."
  return (
    <MoneyBoard
      rows={expenses.rows}
      currency={expenses.currency}
      today={clock.today}
      visibility={expenses.visibility}
      budgetLabel={budgetLabel}
      error={expenses.error}
    />
  )
}
