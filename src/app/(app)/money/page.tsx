import type { Metadata } from "next"

import { MoneyScan } from "@/components/money/money-scan"
import { SectionSegments } from "@/components/shell/section-segments"
import { listBills, listExpenses, listGoals, listMoneyCards, listMoneyPayments, listMoneyPeople, listSubscriptions } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"
import { moneyScanSection } from "@/lib/money/board"
import { primaryNav, railChildren } from "@/lib/navigation"

export const metadata: Metadata = { title: "Money" }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>
}) {
  const selected = moneyScanSection((await searchParams).section)
  const money = primaryNav.find((item) => item.href === "/money")
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
    <>
      {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" section={selected} /> : null}
      <MoneyScan
        section={selected}
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
    </>
  )
}
