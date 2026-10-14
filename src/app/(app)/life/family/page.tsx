import type { Metadata } from "next"

import { FamilyBoard } from "@/components/family/family-board"
import { loadFamily } from "@/lib/data/family"

export const metadata: Metadata = { title: "Family" }

export default async function Page() {
  const family = await loadFamily()
  return <FamilyBoard members={family.members} canEdit={family.canEdit} error={family.error} />
}
