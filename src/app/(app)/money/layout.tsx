import { MoneyOverview } from "@/components/money/money-overview"
import { SectionSegments } from "@/components/shell/section-segments"
import { listBills, listExpenses, listGoals, listMoneyCards, listMoneyPayments, listMoneyPeople, listSubscriptions } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"
import { buildMoneyInsights } from "@/lib/money/insights"
import { primaryNav, railChildren } from "@/lib/navigation"

export default async function MoneyLayout({ children }: { children: React.ReactNode }) {
  const money = primaryNav.find((item) => item.href === "/money")
  const clock = await pageClock()
  const [bills, income, goals, subscriptions, payments, cards, people] = await Promise.all([
    listBills(),
    listExpenses("income"),
    listGoals(),
    listSubscriptions(),
    listMoneyPayments(),
    listMoneyCards(),
    listMoneyPeople(),
  ])
  const insights = buildMoneyInsights({
    today: clock.today,
    currency: bills.currency,
    bills: bills.rows,
    payments: payments.rows,
    income: income.rows,
    goals: goals.rows,
    subscriptions: subscriptions.rows,
    cards: cards.rows,
    people: people.rows,
  })

  return (
    <div>
      <div className="mb-4 md:mb-5">
        <MoneyOverview
          today={clock.today}
          currency={bills.currency}
          bills={bills.rows}
          payments={payments.rows}
          income={income.rows}
          goals={goals.rows}
          subscriptions={subscriptions.rows}
          cards={cards.rows}
          people={people.rows}
          insights={insights}
        />
      </div>
      <div className="grid gap-5">
        {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
        {children}
      </div>
    </div>
  )
}
