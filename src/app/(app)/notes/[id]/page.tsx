import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { NoteEditor } from "@/components/records/section-board"
import { getNote } from "@/lib/data/lists"

export const metadata: Metadata = { title: "Note" }

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const note = await getNote(id)
  if (!note) notFound()
  return (
    <div className="grid gap-4">
      <NoteEditor note={note} />
      <Link href="/notes" className="text-sm text-brand-deep">
        All notes
      </Link>
    </div>
  )
}
