import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { PeopleBoard } from "@/components/money/balance-board"
import { AppearanceControl } from "@/components/settings/appearance-control"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import type { MoneyPaymentRow, MoneyPersonRow } from "@/lib/data/home"
import { primaryNav, railChildren } from "@/lib/navigation"
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"

import { previewSession } from "../../shell-session"

export const dynamic = "force-dynamic"

const today = "2026-10-02"

const rows: MoneyPersonRow[] = [
  { id: "alex", name: "Alex", amount_cents: 6000, due_on: null, note: "tickets", visibility: "private" },
]

const payments: MoneyPaymentRow[] = [
  {
    id: "pay-alex",
    bill_id: null,
    card_id: null,
    person_id: "alex",
    amount_cents: 2000,
    paid_on: "2026-09-28",
    note: null,
  },
]

export default async function PreviewPeople() {
  if (process.env.NODE_ENV === "production") notFound()
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-5">
        <AppearanceControl appearance={appearance} />
        {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
        <PeopleBoard rows={rows} payments={payments} currency="USD" today={today} />
      </div>
    </AppShell>
  )
}
