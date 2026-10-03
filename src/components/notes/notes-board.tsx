"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { RecordDialog } from "@/components/create/record-dialog"
import { LifeFab, PhoneFabClearance } from "@/components/life/life-chrome"
import type { MoneyVisibility } from "@/components/money/money-chrome"
import {
  ConfirmRemove,
  EmptyState,
  FilterEmpty,
  MetricChip,
  MoneyAddButton,
  MoneyCard,
  MoneyFrame,
  RowMenu,
} from "@/components/money/money-chrome"
import { VisibilityPill, WidgetError } from "@/components/ui/pills"
import { deleteNote, setNoteVisibility } from "@/lib/actions/records"
import type { NoteRow } from "@/lib/data/home"
import { relativeTime } from "@/lib/home/metrics"
import {
  NOTES_COPY,
  noteChipLabels,
  noteMetrics,
  notePreview,
  recentNotes,
  visibleNotes,
} from "@/lib/notes/board"
import type { Visibility } from "@/lib/visibility"
import { cn } from "cn"

const FILTER_KEY = "deanly-notes-visibility"

function subscribeVisibility(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange)
  window.addEventListener(FILTER_KEY, onStoreChange)
  return () => {
    window.removeEventListener("storage", onStoreChange)
    window.removeEventListener(FILTER_KEY, onStoreChange)
  }
}

function readVisibility(): MoneyVisibility {
  const stored = window.localStorage.getItem(FILTER_KEY)
  if (stored === "all" || stored === "shared" || stored === "private") return stored
  return "all"
}

function useNotesVisibility() {
  const filter = useSyncExternalStore(subscribeVisibility, readVisibility, () => "all" as const)
  function setFilter(next: MoneyVisibility) {
    window.localStorage.setItem(FILTER_KEY, next)
    window.dispatchEvent(new Event(FILTER_KEY))
  }
  return { filter, setFilter }
}

export function NotesBoard({
  rows,
  today,
  timeZone,
  error,
}: {
  rows: NoteRow[]
  today: string
  timeZone: string
  error?: boolean
}) {
  const router = useRouter()
  const { filter, setFilter } = useNotesVisibility()
  const [patches, setPatches] = useState<Record<string, Partial<NoteRow>>>({})
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<NoteRow | null>(null)
  const [pendingRemove, setPendingRemove] = useState(false)

  const items = rows.map((row) => (patches[row.id] ? { ...row, ...patches[row.id] } : row))
  const visible = visibleNotes(items, filter)
  const recent = recentNotes(visible)
  const chips = noteChipLabels(noteMetrics(items, today, timeZone))
  const phoneEmpty = items.length === 0

  function patch(id: string, next: Partial<NoteRow>) {
    setPatches((current) => ({ ...current, [id]: { ...current[id], ...next } }))
  }

  async function changeVisibility(note: NoteRow, visibility: Visibility) {
    const previous = note.visibility
    patch(note.id, { visibility })
    const result = await setNoteVisibility(note.id, visibility)
    if (!result.ok) {
      patch(note.id, { visibility: previous })
      toast(result.message)
      return
    }
    router.refresh()
  }

  return (
    <>
      <MoneyFrame
        phoneTouch
        className={phoneEmpty ? "max-md:gap-2" : undefined}
        headerClassName={phoneEmpty ? "max-md:gap-2" : undefined}
        title="Notes"
        subtitle={NOTES_COPY.subtitle}
        filter={filter}
        onFilter={setFilter}
        action={
          <div className="hidden md:block">
            <MoneyAddButton onClick={() => setAdding(true)}>New note</MoneyAddButton>
          </div>
        }
        chips={
          chips.length ? (
            <>
              {chips.map((chip) => (
                <MetricChip key={chip.id} tone={chip.tone}>
                  {chip.label}
                </MetricChip>
              ))}
            </>
          ) : null
        }
        pulse={<RecentPulse notes={recent} phoneCompact={phoneEmpty} />}
      >
        {error ? <WidgetError /> : null}
        {phoneEmpty ? (
          <EmptyState
            className="max-md:pt-3 max-md:pb-1"
            copy={NOTES_COPY.emptyList}
            action={<MoneyAddButton onClick={() => setAdding(true)}>New note</MoneyAddButton>}
          />
        ) : null}
        {items.length > 0 && visible.length === 0 ? (
          <FilterEmpty copy={NOTES_COPY.filterEmpty} onClear={() => setFilter("all")} />
        ) : null}
        {visible.map((note) => (
          <MoneyCard key={note.id} id={`item-${note.id}`} linked>
            <div className="flex items-start justify-between gap-3">
              <Link
                href={`/notes/${note.id}`}
                className="min-w-0 flex-1 rounded-md max-md:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <p className="text-[15px] font-medium leading-snug text-ink md:text-base">{note.title}</p>
                <p
                  className={cn(
                    "mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground",
                    !note.body.trim() && "text-muted-foreground/80",
                  )}
                >
                  {notePreview(note.body)}
                </p>
              </Link>
              <div className="flex shrink-0 items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
                <VisibilityPill visibility={note.visibility} />
                <span className="whitespace-nowrap text-xs text-muted-foreground">{relativeTime(note.updated_at)}</span>
                <RowMenu
                  className="max-md:min-h-11 max-md:min-w-11"
                  label={note.title}
                  visibility={note.visibility}
                  onEdit={() => router.push(`/notes/${note.id}`)}
                  onVisibility={(visibility) => void changeVisibility(note, visibility)}
                  onRemove={() => setRemoving(note)}
                />
              </div>
            </div>
          </MoneyCard>
        ))}
        <RecordDialog
          key={adding ? "note-add" : "note-idle"}
          kind="note"
          today={today}
          defaultVisibility="private"
          sheetOnPhone
          open={adding}
          onOpenChange={setAdding}
        />
        <ConfirmRemove
          sheetOnPhone
          open={Boolean(removing)}
          title={NOTES_COPY.remove}
          pending={pendingRemove}
          onOpenChange={(open) => {
            if (!open) setRemoving(null)
          }}
          onConfirm={async () => {
            if (!removing) return
            setPendingRemove(true)
            const result = await deleteNote(removing.id)
            setPendingRemove(false)
            if (!result.ok) {
              toast(result.message)
              return
            }
            setRemoving(null)
            router.refresh()
          }}
        />
        <PhoneFabClearance />
        <div aria-hidden="true" className="h-12 md:hidden" />
      </MoneyFrame>
      <LifeFab>
        <MoneyAddButton className="h-11 px-4 shadow-soft" onClick={() => setAdding(true)}>
          New note
        </MoneyAddButton>
      </LifeFab>
    </>
  )
}

function RecentPulse({ notes, phoneCompact = false }: { notes: NoteRow[]; phoneCompact?: boolean }) {
  return (
    <section
      className={cn(
        "rounded-[12px] border border-border bg-surface p-4 shadow-soft md:p-[18px]",
        phoneCompact && "max-md:px-4 max-md:py-2",
      )}
    >
      <h2 className="text-[13px] font-medium text-ink">Recent</h2>
      {notes.length === 0 ? (
        <p className={cn("mt-3 text-sm text-muted-foreground", phoneCompact && "max-md:mt-2")}>{NOTES_COPY.pulseEmpty}</p>
      ) : (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {notes.map((note) => (
            <li key={note.id} className="w-[120px] shrink-0 md:w-[148px]">
              <Link
                href={`/notes/${note.id}`}
                className="flex min-h-16 flex-col gap-1 rounded-[10px] bg-surface-muted px-2.5 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate text-[13px] font-medium text-ink">{note.title}</span>
                <VisibilityPill visibility={note.visibility} />
                <span className="text-xs text-muted-foreground">{relativeTime(note.updated_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
