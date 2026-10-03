import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { BillsBoard } from "@/components/money/bills-board"
import { AppearanceControl } from "@/components/settings/appearance-control"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import type { BillRow } from "@/lib/data/home"
import { primaryNav, railChildren } from "@/lib/navigation"
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"

import { previewSession } from "../../shell-session"

export const dynamic = "force-dynamic"

const today = "2026-10-02"

const rows: BillRow[] = [
  { id: "storage", name: "Storage", amount_cents: 9100, due_on: "2026-10-01", paid_at: null, visibility: "shared" },
  { id: "electric", name: "Electric", amount_cents: 12000, due_on: "2026-10-03", paid_at: null, visibility: "shared" },
  { id: "gym", name: "Gym", amount_cents: 3000, due_on: "2026-10-06", paid_at: null, visibility: "private" },
  { id: "internet", name: "Internet", amount_cents: 6000, due_on: "2026-10-08", paid_at: "2026-10-02T15:00:00Z", visibility: "shared" },
  { id: "gas", name: "Gas", amount_cents: 5500, due_on: "2026-10-11", paid_at: null, visibility: "shared" },
  { id: "truck", name: "Truck payment", amount_cents: 41700, due_on: "2026-10-13", paid_at: null, visibility: "shared" },
  { id: "rent", name: "Rent", amount_cents: 190000, due_on: "2026-11-01", paid_at: null, visibility: "shared" },
]

export default async function PreviewBills() {
  if (process.env.NODE_ENV === "production") notFound()
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <AppearanceControl appearance={appearance} />
        </div>
        {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
        <BillsBoard
          rows={rows}
          currency="USD"
          today={today}
          householdName="DeanFamily"
          budgetCents={365000}
          paydayDates={["2026-10-10", "2026-10-25"]}
        />
      </div>
    </AppShell>
  )
}
