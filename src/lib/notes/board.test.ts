import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { defaultVisibilityFor } from "../visibility.ts"
import {
  NOTES_COPY,
  noteChipLabels,
  noteMetrics,
  notePreview,
  recentNotes,
  sortNotes,
  visibleNotes,
} from "./board.ts"

const today = "2026-10-02"
const zone = "America/Denver"

const notes = [
  {
    id: "truck",
    title: "Truck registration reminder",
    body: "   ",
    visibility: "private" as const,
    updated_at: "2026-10-02T18:00:00.000Z",
  },
  {
    id: "daycare",
    title: "Daycare pickup codes",
    body: "Gate code is 1942.",
    visibility: "shared" as const,
    updated_at: "2026-10-02T18:00:00.000Z",
  },
  {
    id: "allergy",
    title: "Wife allergy — no zucchini",
    body: "Skip zucchini in the pasta.",
    visibility: "shared" as const,
    updated_at: "2026-10-01T18:00:00.000Z",
  },
  {
    id: "pack",
    title: "Pack soccer bag checklist",
    body: "Cleats, water, snack.",
    visibility: "shared" as const,
    updated_at: "2026-10-03T05:30:00.000Z",
  },
]

test("locked notes copy does not name the household", () => {
  assert.equal(NOTES_COPY.subtitle, "For the house, or just you.")
  assert.equal(NOTES_COPY.emptyList, "Nothing written down yet.")
  assert.equal(NOTES_COPY.pulseEmpty, "Nothing recent yet.")
  assert.equal(NOTES_COPY.filterEmpty, "Nothing matches these filters.")
  assert.equal(NOTES_COPY.emptyBody, "No text yet.")
  assert.equal(NOTES_COPY.saved, "Saved.")
  assert.equal(NOTES_COPY.remove, "Remove this note?")
  for (const line of Object.values(NOTES_COPY)) {
    assert.equal(/deanfamily/i.test(line), false)
  }
})

test("new notes stay just me even when the last save was shared", () => {
  assert.equal(defaultVisibilityFor("note"), "private")
  assert.equal(defaultVisibilityFor("note", "shared"), "private")
})

test("notes sort by recent update, then shared", () => {
  assert.deepEqual(sortNotes(notes).map((note) => note.id), ["pack", "daycare", "truck", "allergy"])
  assert.deepEqual(visibleNotes(notes, "private").map((note) => note.id), ["truck"])
  assert.equal(visibleNotes(notes, "all").length, 4)
  assert.deepEqual(recentNotes(sortNotes(notes)).map((note) => note.id), ["pack", "daycare", "truck", "allergy"])
})

test("note chips hide zeros and keep just me on sand", () => {
  const metrics = noteMetrics(notes, today, zone)
  assert.deepEqual(metrics, { total: 4, shared: 3, personal: 1, today: 3 })
  const chips = noteChipLabels(metrics)
  assert.deepEqual(
    chips.map((chip) => [chip.id, chip.label, chip.tone]),
    [
      ["total", "4 notes", "muted"],
      ["shared", "3 shared", "brand"],
      ["personal", "1 just me", "sand"],
      ["today", "3 today", "brand"],
    ],
  )
  assert.equal(chips.some((chip) => chip.tone === "sand" && chip.id === "personal"), true)
  assert.equal(chips.some((chip) => chip.tone === "danger"), false)
  assert.deepEqual(noteChipLabels({ total: 0, shared: 0, personal: 0, today: 0 }), [])
  assert.equal(noteChipLabels({ total: 1, shared: 0, personal: 1, today: 0 })[0]?.label, "1 note")
})

test("empty note bodies use the locked preview", () => {
  assert.equal(notePreview(""), NOTES_COPY.emptyBody)
  assert.equal(notePreview("  \n"), NOTES_COPY.emptyBody)
  assert.equal(notePreview("Gate code is 1942."), "Gate code is 1942.")
})

test("note reads stay on the session client and visibility is not an updateNote column", () => {
  const root = dirname(fileURLToPath(import.meta.url))
  const records = readFileSync(join(root, "../actions/records.ts"), "utf8")
  const lists = readFileSync(join(root, "../data/lists.ts"), "utf8")

  function sliceFn(source: string, name: string) {
    const start = source.indexOf(`export async function ${name}`)
    assert.notEqual(start, -1, name)
    const next = source.indexOf("\nexport async function ", start + 10)
    return source.slice(start, next === -1 ? undefined : next)
  }

  const create = sliceFn(records, "createNote")
  assert.match(create, /household_id: ready\.ctx\.householdId/)
  assert.match(create, /owner_id: ready\.ctx\.userId/)
  assert.match(create, /defaultVisibilityFor\("note"\)/)
  assert.doesNotMatch(create, /lastVisibility/)
  assert.doesNotMatch(create, /formData\.get\("household_id"\)/)
  assert.doesNotMatch(create, /formData\.get\("owner_id"\)/)
  assert.doesNotMatch(create, /visibility:\s*"shared"/)
  assert.match(create, /entityType: "note"/)
  assert.doesNotMatch(create, /service/i)

  const update = sliceFn(records, "updateNote")
  assert.match(update, /\.update\(\{ title, body \}\)/)
  assert.doesNotMatch(update, /visibility/)

  assert.match(sliceFn(records, "setNoteVisibility"), /setRecordVisibility\("notes"/)
  assert.match(sliceFn(records, "deleteNote"), /removeRecord\("notes"/)
  assert.match(records, /function setRecordVisibility\([\s\S]*?"notes"/)
  assert.doesNotMatch(sliceFn(records, "setNoteVisibility"), /service/i)

  const listed = sliceFn(lists, "listNotes")
  assert.match(listed, /requireHousehold/)
  assert.match(listed, /ctx\.supabase/)
  assert.match(listed, /from\("notes"\)/)
  const one = sliceFn(lists, "getNote")
  assert.match(one, /requireHousehold/)
  assert.match(one, /ctx\.supabase/)
  assert.doesNotMatch(one, /service/i)

  const search = sliceFn(records, "searchRecords")
  assert.match(search, /from\("notes"\)/)
  assert.match(search, /ready\.ctx/)
  assert.doesNotMatch(search, /service/i)
})

test("notes phone uses the Life FAB clearance and skips a segment strip", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../components/notes")
  const board = readFileSync(join(root, "notes-board.tsx"), "utf8")
  const editor = readFileSync(join(root, "note-editor.tsx"), "utf8")
  assert.match(board, /<PhoneFabClearance \/>/)
  assert.match(board, /<LifeFab>/)
  assert.match(board, /className="hidden md:block"/)
  assert.match(board, /defaultVisibility="private"/)
  assert.doesNotMatch(board, /SectionSegments/)
  assert.doesNotMatch(board, /tone="danger"/)
  assert.match(editor, /NOTES_COPY\.saved/)
  assert.match(editor, /NOTES_COPY\.remove/)
  assert.match(editor, /setNoteVisibility/)
  assert.match(editor, /bg-brand-soft text-on-brand-soft/)
  assert.match(editor, /bg-sand text-sand-ink/)
  assert.doesNotMatch(editor, /SectionSegments/)
  assert.doesNotMatch(editor, /bg-danger|bg-red/)
})
