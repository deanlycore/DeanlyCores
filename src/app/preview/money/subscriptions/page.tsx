import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { SubscriptionsBoard } from "@/components/money/subscriptions-board"
import { AppearanceControl } from "@/components/settings/appearance-control"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import type { SubscriptionRow } from "@/lib/data/home"
import { primaryNav, railChildren } from "@/lib/navigation"
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"

import { previewSession } from "../../shell-session"

export const dynamic = "force-dynamic"

const rows: SubscriptionRow[] = [
  { id: "music", name: "Music", amount_cents: 4200, renews_on: "2026-10-12", active: true, visibility: "shared", category: "Music", cadence: "month" },
  { id: "cloud", name: "Cloud storage", amount_cents: 4200, renews_on: "2026-10-20", active: true, visibility: "private", category: "Cloud Storage", cadence: "month" },
  { id: "domain", name: "Domain", amount_cents: 12000, renews_on: "2026-12-01", active: true, visibility: "shared", category: "Technology", cadence: "year" },
]

export default async function PreviewSubscriptions() {
  if (process.env.NODE_ENV === "production") notFound()
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-4">
        <AppearanceControl appearance={appearance} />
        {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
        <SubscriptionsBoard rows={rows} currency="USD" today="2026-10-02" householdName="DeanFamily" />
      </div>
    </AppShell>
  )
}
