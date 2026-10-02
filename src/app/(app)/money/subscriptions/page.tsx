import type { Metadata } from "next"

import { SubscriptionsBoard } from "@/components/money/subscriptions-board"
import { getSessionView } from "@/lib/data/session"
import { listSubscriptions } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Subscriptions" }

export default async function Page() {
  const [clock, rows, session] = await Promise.all([pageClock(), listSubscriptions(), getSessionView()])
  return (
    <SubscriptionsBoard
      rows={rows.rows}
      currency={rows.currency}
      today={clock.today}
      householdName={session.householdName}
      error={rows.error}
    />
  )
}
