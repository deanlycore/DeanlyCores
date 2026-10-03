import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { SavingsBoard } from "@/components/money/savings-board"
import { AppearanceControl } from "@/components/settings/appearance-control"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import type { GoalRow } from "@/lib/data/home"
import { primaryNav, railChildren } from "@/lib/navigation"
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"

import { previewSession } from "../../shell-session"

export const dynamic = "force-dynamic"

const rows: GoalRow[] = [
  { id: "emergency", name: "Emergency fund", target_cents: 500000, current_cents: 180000, visibility: "shared", category: "Emergency Fund" },
  { id: "weekend", name: "Weekend away", target_cents: 120000, current_cents: 40000, visibility: "shared", category: "Vacation" },
  { id: "tires", name: "New tires", target_cents: 80000, current_cents: 15000, visibility: "private", category: "Vehicle" },
  { id: "holiday", name: "Holiday", target_cents: 200000, current_cents: 0, visibility: "shared", category: "Christmas / Holidays" },
]

export default async function PreviewSavings() {
  if (process.env.NODE_ENV === "production") notFound()
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-4">
        <AppearanceControl appearance={appearance} />
        {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
        <SavingsBoard rows={rows} currency="USD" today="2026-10-02" householdName="DeanFamily" />
      </div>
    </AppShell>
  )
}
