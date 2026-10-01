import type { Metadata } from "next"

import { VaultBoard } from "@/components/records/section-board"
import { listDocuments } from "@/lib/data/lists"
import { pageClock } from "@/lib/data/timezone"

export const metadata: Metadata = { title: "Vault" }

export default async function Page() {
  const [clock, docs] = await Promise.all([pageClock(), listDocuments()])
  return <VaultBoard rows={docs.rows} today={clock.today} visibility={docs.visibility} error={docs.error} />
}
