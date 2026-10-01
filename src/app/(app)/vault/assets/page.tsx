import type { Metadata } from "next"

import { PlainBoard } from "@/components/records/section-board"

export const metadata: Metadata = { title: "Assets" }

export default function Page() {
  return <PlainBoard title="Assets" body="No assets are written down. Papers you upload live in Vault documents." />
}
