import { zonedDate } from "@/lib/home/metrics"
import { applyVisibility } from "@/lib/money/board"
import type { Visibility } from "@/lib/visibility"

export const NOTES_COPY = {
  subtitle: "For the house, or just you.",
  emptyList: "Nothing written down yet.",
  pulseEmpty: "Nothing recent yet.",
  filterEmpty: "Nothing matches these filters.",
  emptyBody: "No text yet.",
  saved: "Saved.",
  remove: "Remove this note?",
} as const

export const RECENT_CAP = 5

export type NoteMetrics = {
  total: number
  shared: number
  personal: number
  today: number
}

export type NoteChip = {
  id: "total" | "shared" | "personal" | "today"
  label: string
  tone: "muted" | "brand" | "sand"
}

type NoteSortable = {
  updated_at: string
  visibility: Visibility
  title: string
}

export function notePreview(body: string) {
  const text = body.replace(/\s+/g, " ").trim()
  return text || NOTES_COPY.emptyBody
}

export function noteUpdatedOn(iso: string, timeZone: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return zonedDate(timeZone, date)
}

/** Counts only the rows the caller already loaded. RLS is what hides another member's Just me notes. */
export function noteMetrics(
  rows: { visibility: Visibility; updated_at: string }[],
  today: string,
  timeZone: string,
): NoteMetrics {
  let shared = 0
  let personal = 0
  let todayCount = 0
  for (const row of rows) {
    if (row.visibility === "shared") shared += 1
    else personal += 1
    if (noteUpdatedOn(row.updated_at, timeZone) === today) todayCount += 1
  }
  return { total: rows.length, shared, personal, today: todayCount }
}

export function noteChipLabels(metrics: NoteMetrics): NoteChip[] {
  const chips: NoteChip[] = []
  if (metrics.total > 0) {
    chips.push({
      id: "total",
      label: `${metrics.total} ${metrics.total === 1 ? "note" : "notes"}`,
      tone: "muted",
    })
  }
  if (metrics.shared > 0) chips.push({ id: "shared", label: `${metrics.shared} shared`, tone: "brand" })
  if (metrics.personal > 0) chips.push({ id: "personal", label: `${metrics.personal} just me`, tone: "sand" })
  if (metrics.today > 0) chips.push({ id: "today", label: `${metrics.today} today`, tone: "brand" })
  return chips
}

/** Newest update first. Shared wins when two notes were saved at the same time. */
export function sortNotes<T extends NoteSortable>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const updated = b.updated_at.localeCompare(a.updated_at)
    if (updated !== 0) return updated
    const shared = Number(a.visibility === "private") - Number(b.visibility === "private")
    if (shared !== 0) return shared
    return a.title.localeCompare(b.title)
  })
}

export function recentNotes<T>(rows: T[]) {
  return rows.slice(0, RECENT_CAP)
}

export function visibleNotes<T extends NoteSortable>(rows: T[], filter: "all" | "shared" | "private") {
  return sortNotes(applyVisibility(rows, filter))
}
