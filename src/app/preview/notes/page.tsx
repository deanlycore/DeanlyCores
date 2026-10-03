import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { NotesBoard } from "@/components/notes/notes-board"
import { AppearanceControl } from "@/components/settings/appearance-control"
import { AppShell } from "@/components/shell/app-shell"
import { zonedDate } from "@/lib/home/metrics"
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"

import { previewSession } from "../shell-session"
import { previewNotes } from "./sample"

export const dynamic = "force-dynamic"

const timeZone = "America/Denver"

export default async function PreviewNotes({
  searchParams,
}: {
  searchParams: Promise<{ empty?: string }>
}) {
  if (process.env.NODE_ENV === "production") notFound()
  const params = await searchParams
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)
  const rows = params.empty === "1" ? [] : previewNotes()
  return (
    <AppShell session={previewSession}>
      <div className="mb-4">
        <AppearanceControl appearance={appearance} />
      </div>
      <NotesBoard rows={rows} today={zonedDate(timeZone)} timeZone={timeZone} />
    </AppShell>
  )
}
