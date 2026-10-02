import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { NoteEditor } from "@/components/notes/note-editor"
import { getNote } from "@/lib/data/lists"

export const metadata: Metadata = { title: "Note" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const note = await getNote(id)
  if (!note) notFound()
  return <NoteEditor note={note} />
}
