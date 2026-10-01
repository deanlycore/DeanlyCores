import type { Metadata } from "next"

import { GoalsBoard } from "@/components/records/section-board"
import { listGoals } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Savings" }

export default async function Page() {
  const [clock, goals] = await Promise.all([pageClock(), listGoals()])
  return <GoalsBoard rows={goals.rows} currency={goals.currency} today={clock.today} visibility={goals.visibility} error={goals.error} />
}
