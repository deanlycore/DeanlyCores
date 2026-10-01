import type { Metadata } from "next"

import { NotesBoard } from "@/components/records/section-board"
import { listNotes } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Notes" }

export default async function Page() {
  const [clock, notes] = await Promise.all([pageClock(), listNotes()])
  return <NotesBoard rows={notes.rows} today={clock.today} visibility={notes.visibility} error={notes.error} />
}
