import type { Metadata } from "next"

import { BillsBoard } from "@/components/money/bills-board"
import { getSessionView } from "@/lib/data/session"
import { listBills, listExpenses, listMonthBudget } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Bills" }

export default async function Page() {
  const clockPromise = pageClock()
  const billsPromise = listBills()
  const incomePromise = listExpenses("income")
  const sessionPromise = getSessionView()
  const clock = await clockPromise
  const [bills, income, session, budget] = await Promise.all([
    billsPromise,
    incomePromise,
    sessionPromise,
    listMonthBudget(clock.today),
  ])
  return (
    <BillsBoard
      rows={bills.rows}
      currency={bills.currency}
      today={clock.today}
      householdName={session.householdName}
      budgetCents={budget.amountCents}
      paydayDates={income.rows.map((row) => row.spent_on)}
      error={bills.error}
    />
  )
}
