import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { IncomeBoard } from "@/components/money/income-board"
import { AppearanceControl } from "@/components/settings/appearance-control"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import type { ExpenseRow } from "@/lib/data/home"
import { primaryNav, railChildren } from "@/lib/navigation"
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"

import { previewSession } from "../../shell-session"

export const dynamic = "force-dynamic"

const rows: ExpenseRow[] = [
  { id: "paycheck", name: "Paycheck", amount_cents: 240000, kind: "income", spent_on: "2026-10-10", visibility: "shared" },
  { id: "side", name: "Side work", amount_cents: 18000, kind: "income", spent_on: "2026-10-25", visibility: "private" },
]

export default async function PreviewIncome() {
  if (process.env.NODE_ENV === "production") notFound()
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-4">
        <AppearanceControl appearance={appearance} />
        {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
        <IncomeBoard rows={rows} currency="USD" today="2026-10-02" householdName="DeanFamily" />
      </div>
    </AppShell>
  )
}
