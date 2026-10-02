import type { Metadata } from "next"

import { SavingsBoard } from "@/components/money/savings-board"
import { getSessionView } from "@/lib/data/session"
import { listGoals } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Savings" }

export default async function Page() {
  const [clock, goals, session] = await Promise.all([pageClock(), listGoals(), getSessionView()])
  return (
    <SavingsBoard
      rows={goals.rows}
      currency={goals.currency}
      today={clock.today}
      householdName={session.householdName}
      error={goals.error}
    />
  )
}
