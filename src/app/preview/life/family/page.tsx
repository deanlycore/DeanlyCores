import { notFound } from "next/navigation"

import { FamilyBoard } from "@/components/family/family-board"
import type { FamilyProfile } from "@/lib/family/profile"

import { LifePreview } from "../chrome"

export const dynamic = "force-dynamic"

const previewFamily: FamilyProfile[] = [
  {
    id: "jordan",
    name: "Jordan",
    role: "Partner",
    birthday: "1992-03-12",
    color: "teal",
    notes: "Saturday soccer.",
    createdAt: "2026-01-02T00:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "riley",
    name: "Riley",
    role: "Grandma",
    birthday: "1954-06-02",
    color: "sand",
    notes: null,
    createdAt: "2026-01-03T00:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "avery",
    name: "Avery",
    role: "Son",
    birthday: "2018-11-18",
    color: "deep",
    notes: null,
    createdAt: "2026-01-04T00:00:00.000Z",
    archivedAt: null,
  },
  {
    id: "casey",
    name: "Casey",
    role: "Cousin",
    birthday: "2001-01-09",
    color: "ink",
    notes: "Kept off the list.",
    createdAt: "2026-01-01T00:00:00.000Z",
    archivedAt: "2026-02-01T00:00:00.000Z",
  },
]

export default async function PreviewFamily({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; role?: string | string[] }>
}) {
  if (process.env.NODE_ENV === "production") notFound()
  const params = await searchParams
  const view = Array.isArray(params.view) ? params.view[0] : params.view
  const role = Array.isArray(params.role) ? params.role[0] : params.role
  const initialSheet = view === "add" || view === "edit" || view === "remove" ? view : null
  return (
    <LifePreview>
      <FamilyBoard
        members={view === "empty" ? [] : previewFamily}
        canEdit={role !== "member"}
        mode="preview"
        initialSheet={initialSheet}
      />
    </LifePreview>
  )
}
