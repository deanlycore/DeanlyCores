import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { NoteEditor } from "@/components/notes/note-editor"
import { AppearanceControl } from "@/components/settings/appearance-control"
import { AppShell } from "@/components/shell/app-shell"
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"

import { previewSession } from "../../shell-session"
import { previewNotes } from "../sample"

export const dynamic = "force-dynamic"

export default async function PreviewNote({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.NODE_ENV === "production") notFound()
  const { id } = await params
  const note = previewNotes().find((row) => row.id === id)
  if (!note) notFound()
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)
  return (
    <AppShell session={previewSession}>
      <div className="mb-4">
        <AppearanceControl appearance={appearance} />
      </div>
      <NoteEditor note={note} />
    </AppShell>
  )
}
