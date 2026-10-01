import type { Metadata } from "next"

import { EventsBoard } from "@/components/records/section-board"
import { listEvents } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Calendar" }

export default async function Page() {
  const [clock, events] = await Promise.all([pageClock(), listEvents()])
  return (
    <EventsBoard
      rows={events.rows}
      today={clock.today}
      timeZone={clock.timeZone}
      visibility={events.visibility}
      error={events.error}
    />
  )
}
