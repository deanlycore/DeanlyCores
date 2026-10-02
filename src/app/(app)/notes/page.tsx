import type { Metadata } from "next"

import { NotesBoard } from "@/components/notes/notes-board"
import { listNotes } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Notes" }

export default async function Page() {
  const [clock, notes] = await Promise.all([pageClock(), listNotes()])
  return <NotesBoard rows={notes.rows} today={clock.today} timeZone={clock.timeZone} error={notes.error} />
}
