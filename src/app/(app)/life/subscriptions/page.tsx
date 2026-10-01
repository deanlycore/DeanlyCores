import type { Metadata } from "next"

import { SubscriptionsBoard } from "@/components/records/section-board"
import { listSubscriptions } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Subscriptions" }

export default async function Page() {
  const [clock, rows] = await Promise.all([pageClock(), listSubscriptions()])
  return (
    <SubscriptionsBoard
      rows={rows.rows}
      currency={rows.currency}
      today={clock.today}
      visibility={rows.visibility}
      error={rows.error}
    />
  )
}
