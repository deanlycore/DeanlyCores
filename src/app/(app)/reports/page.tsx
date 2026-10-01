import type { Metadata } from "next"

import { loadHome } from "@/lib/data/home"
import { pageClock } from "@/lib/data/timezone"
import { billsDueThisWeek, budgetPulse, formatMoney, spentAgainstBudget, taskProgress } from "@/lib/home/metrics"

export const metadata: Metadata = { title: "Reports" }

export default async function Page() {
  const clock = await pageClock()
  const data = await loadHome(clock.timeZone)
  const spent = data?.budget ? spentAgainstBudget(data.expenses, data.budget.visibility) : 0
  const pulse = budgetPulse(data?.budget?.amountCents ?? null, spent)
  const tasks = taskProgress(data?.tasks ?? [])
  const bills = data ? billsDueThisWeek(data.bills, data.today).length : 0
  return (
    <div className="mx-auto grid max-w-[1180px] gap-4">
      <header>
        <h1 className="font-display text-[28px] font-semibold tracking-tight">Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">A quiet look at this month. Not a scorecard.</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Spent", data?.budget ? formatMoney(spent, data.currency) : "No budget yet"],
          ["Remaining", pulse.remaining == null ? "—" : formatMoney(pulse.remaining, data?.currency ?? "USD")],
          ["Bills this week", String(bills)],
          ["Tasks today", `${tasks.done} of ${tasks.total}`],
          ["Meals this week", String(data?.meals.length ?? 0)],
          ["Open shopping", String((data?.shopping ?? []).filter((item) => !item.checked_at).length)],
        ].map(([label, value]) => (
          <li key={label} className="deanly-card p-5">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
