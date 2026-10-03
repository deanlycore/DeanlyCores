import { cookies } from "next/headers"
import { notFound } from "next/navigation"

import { CardsBoard } from "@/components/money/balance-board"
import { AppearanceControl } from "@/components/settings/appearance-control"
import { AppShell } from "@/components/shell/app-shell"
import { SectionSegments } from "@/components/shell/section-segments"
import type { MoneyCardRow, MoneyPaymentRow } from "@/lib/data/home"
import { primaryNav, railChildren } from "@/lib/navigation"
import { APPEARANCE_COOKIE, parseAppearance } from "@/lib/theme"

import { previewSession } from "../../shell-session"

export const dynamic = "force-dynamic"

const today = "2026-10-02"

const rows: MoneyCardRow[] = [
  { id: "store", name: "Store card", amount_cents: 12000, due_on: "2026-10-18", note: null, visibility: "private" },
  { id: "visa", name: "Household visa", amount_cents: 64000, due_on: null, note: null, visibility: "shared" },
]

const payments: MoneyPaymentRow[] = [
  {
    id: "pay-visa",
    bill_id: null,
    card_id: "visa",
    person_id: null,
    amount_cents: 8000,
    paid_on: "2026-10-01",
    note: null,
  },
]

export default async function PreviewCards() {
  if (process.env.NODE_ENV === "production") notFound()
  const appearance = parseAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value)
  const money = primaryNav.find((item) => item.href === "/money")
  return (
    <AppShell session={previewSession}>
      <div className="grid gap-5">
        <AppearanceControl appearance={appearance} />
        {money ? <SectionSegments label="Money" segments={railChildren(money)} tone="life" /> : null}
        <CardsBoard rows={rows} payments={payments} currency="USD" today={today} />
      </div>
    </AppShell>
  )
}
