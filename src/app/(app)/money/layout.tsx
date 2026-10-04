import { MoneySnapshot } from "@/components/money/money-snapshot"
import { SectionSegments } from "@/components/shell/section-segments"
import { listBills, listExpenses, listGoals, listMoneyPayments, listSubscriptions } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"
import { primaryNav, railChildren } from "@/lib/navigation"

export default async function MoneyLayout({ children }: { children: React.ReactNode }) {
  const money = primaryNav.find((item) => item.href === "/money")
  const clock = await pageClock()
  const [bills, income, goals, subscriptions, payments] = await Promise.all([
    listBills(),
    listExpenses("income"),
    listGoals(),
    listSubscriptions(),
    listMoneyPayments(),
  ])

  return (
    <div>
      <div className="mb-4 md:mb-5">
        <MoneySnapshot
          today={clock.today}
          currency={bills.currency}
          bills={bills.rows}
          payments={payments.rows}
          income={income.rows}
          goals={goals.rows}
          subscriptions={subscriptions.rows}
        />
      </div>
      <div className="grid gap-5">
        {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
        {children}
      </div>
    </div>
  )
}
