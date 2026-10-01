import type { Metadata } from "next"

import { PlainBoard } from "@/components/records/section-board"

export const metadata: Metadata = { title: "Debt" }

export default function Page() {
  return <PlainBoard title="Debt" body="No balances are written down. When you’re ready, they’ll sit here without a red banner." />
}
