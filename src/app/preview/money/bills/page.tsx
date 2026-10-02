import { notFound } from "next/navigation"

import { BillsBoard } from "@/components/records/section-board"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import { primaryNav, railChildren } from "@/lib/navigation"

import { previewSession } from "../../shell-session"

export const dynamic = "force-dynamic"

export default function PreviewBills() {
  if (process.env.NODE_ENV === "production") notFound()
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-4">
        {money ? <SectionSegments label="Money" segments={railChildren(money)} /> : null}
        <BillsBoard
          rows={[
            { id: "b1", name: "Electric", amount_cents: 8500, due_on: "2026-10-03", paid_at: null, visibility: "shared" },
            { id: "b2", name: "Internet", amount_cents: 6000, due_on: "2026-10-08", paid_at: null, visibility: "shared" },
          ]}
          currency="USD"
          today="2026-10-02"
          visibility="shared"
        />
      </div>
    </AppShell>
  )
}
