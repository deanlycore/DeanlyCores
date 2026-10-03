import type { Metadata } from "next"

import { MoneyScan } from "@/components/money/money-scan"
import { listBills, listExpenses, listGoals, listMoneyCards, listMoneyPayments, listMoneyPeople, listSubscriptions } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Money" }

export default async function Page() {
  const clock = await pageClock()
  const [bills, income, goals, subscriptions, cards, people, payments] = await Promise.all([
    listBills(),
    listExpenses("income"),
    listGoals(),
    listSubscriptions(),
    listMoneyCards(),
    listMoneyPeople(),
    listMoneyPayments(),
  ])
  return (
    <MoneyScan
      today={clock.today}
      currency={bills.currency}
      bills={bills.rows}
      billsError={bills.error || payments.error}
      income={income.rows}
      incomeError={income.error}
      goals={goals.rows}
      goalsError={goals.error}
      subscriptions={subscriptions.rows}
      subscriptionsError={subscriptions.error}
      cards={cards.rows}
      people={people.rows}
      payments={payments.rows}
      cardsError={cards.error || payments.error}
      peopleError={people.error || payments.error}
    />
  )
}
