"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { ChevronLeft } from "lucide-react"
import { toast } from "sonner"

import { ConfirmRemove } from "@/components/money/money-chrome"
import { Button } from "@/components/ui/button"
import { deleteNote, setNoteVisibility, updateNote } from "@/lib/actions/records"
import type { NoteRow } from "@/lib/data/home"
import { relativeTime } from "@/lib/home/metrics"
import { NOTES_COPY } from "@/lib/notes/board"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"

export function NoteEditor({ note }: { note: NoteRow }) {
  const router = useRouter()
  const formId = `note-editor-${note.id}`
  const [noteId, setNoteId] = useState(note.id)
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [visibility, setVisibility] = useState(note.visibility)
  const [pending, setPending] = useState(false)
  const [visibilityPending, setVisibilityPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState(false)

  if (note.id !== noteId) {
    setNoteId(note.id)
    setTitle(note.title)
    setBody(note.body)
    setVisibility(note.visibility)
  }

  async function changeVisibility(next: Visibility) {
    if (next === visibility || visibilityPending) return
    const previous = visibility
    setVisibility(next)
    setVisibilityPending(true)
    const result = await setNoteVisibility(note.id, next)
    setVisibilityPending(false)
    if (!result.ok) {
      setVisibility(previous)
      toast(result.message)
      return
    }
    router.refresh()
  }

  async function remove() {
    setPendingRemove(true)
    const result = await deleteNote(note.id)
    setPendingRemove(false)
    if (!result.ok) {
      toast(result.message)
      return
    }
    setConfirmOpen(false)
    router.push("/notes")
    router.refresh()
  }

  return (
    <div className="mx-auto grid w-full max-w-[760px] gap-4 pb-24 md:pb-0">
      <Link href="/notes" className="inline-flex min-h-11 w-fit items-center gap-1 text-sm font-medium text-brand-deep md:min-h-0">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Notes
      </Link>
      <form
        id={formId}
        className="grid gap-4"
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.requestSubmit()
          }
        }}
        action={async (formData) => {
          setPending(true)
          const result = await updateNote(note.id, formData)
          setPending(false)
          if (!result.ok) {
            toast(result.message)
            return
          }
          toast(NOTES_COPY.saved)
          router.refresh()
        }}
      >
        <label className="grid gap-1.5">
          <span className="sr-only">Title</span>
          <input
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            className="h-11 rounded-button border border-input bg-surface px-3 text-[15px] font-medium text-ink"
          />
        </label>
        <div className="hidden items-center justify-between gap-3 md:flex">
          <VisibilityChoice value={visibility} pending={visibilityPending || pending} onChange={(next) => void changeVisibility(next)} />
          <Button type="submit" disabled={pending || visibilityPending} className="h-10 rounded-button px-4 text-primary-foreground">
            {pending ? "Saving…" : "Save note"}
          </Button>
        </div>
        <label className="grid gap-1.5">
          <span className="sr-only">Note</span>
          <textarea
            name="body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={12}
            className="min-h-64 rounded-2xl border border-input bg-surface px-3 py-3 text-sm text-ink"
          />
        </label>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">Updated · {relativeTime(note.updated_at)}</p>
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm font-medium text-danger md:min-h-0"
            onClick={() => setConfirmOpen(true)}
          >
            Delete…
          </button>
        </div>
      </form>
      <div className="fixed inset-x-0 z-40 border-t border-border bg-background/95 px-4 py-2 backdrop-blur md:hidden bottom-[calc(4.75rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-[760px] flex-wrap items-center justify-between gap-2">
          <VisibilityChoice value={visibility} pending={visibilityPending || pending} onChange={(next) => void changeVisibility(next)} />
          <Button
            type="submit"
            form={formId}
            disabled={pending || visibilityPending}
            className="h-11 shrink-0 rounded-button px-4 text-primary-foreground"
          >
            {pending ? "Saving…" : "Save note"}
          </Button>
        </div>
      </div>
      <ConfirmRemove
        sheetOnPhone
        open={confirmOpen}
        title={NOTES_COPY.remove}
        pending={pendingRemove}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void remove()}
      />
    </div>
  )
}

function VisibilityChoice({
  value,
  pending,
  onChange,
}: {
  value: Visibility
  pending?: boolean
  onChange: (next: Visibility) => void
}) {
  const options = [
    { id: "shared" as const, label: "Shared" },
    { id: "private" as const, label: "Just me" },
  ]
  return (
    <div role="radiogroup" aria-label="Who can see this note" className="inline-flex max-w-full rounded-full border border-border bg-surface p-0.5">
      {options.map((option) => {
        const selected = value === option.id
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending}
            onClick={() => onChange(option.id)}
            className={cn(
              "h-11 rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150 md:h-9",
              selected && option.id === "shared" && "bg-brand-soft text-on-brand-soft",
              selected && option.id === "private" && "bg-sand text-sand-ink",
              !selected && "text-muted-foreground hover:text-ink",
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
