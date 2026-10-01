import type { Metadata } from "next"

import { MealsBoard } from "@/components/records/section-board"
import { listMeals } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Meals" }

export default async function Page() {
  const [clock, meals] = await Promise.all([pageClock(), listMeals()])
  return <MealsBoard rows={meals.rows} today={clock.today} visibility={meals.visibility} error={meals.error} />
}
