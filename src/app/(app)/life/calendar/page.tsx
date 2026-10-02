import type { Metadata } from "next"

import { CalendarBoard } from "@/components/life/calendar-board"
import { listEvents } from "@/lib/data/lists"
import { getSessionView } from "@/lib/data/session"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Calendar" }

export default async function Page() {
  const [clock, events, session] = await Promise.all([pageClock(), listEvents(), getSessionView()])
  return (
    <CalendarBoard
      rows={events.rows}
      today={clock.today}
      timeZone={clock.timeZone}
      householdName={session.householdName}
      error={events.error}
    />
  )
}
