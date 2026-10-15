import { formatMoney, formatShortDate } from "@/lib/home/metrics"
import { billAmountLeft } from "@/lib/money/board"
import { snapshotAvailable } from "@/lib/money/snapshot"

export const OVERVIEW_COPY = {
  title: "Overview",
  spend: "Spend",
  attention: "Attention",
  ahead: "Ahead",
  insights: "Insights",
  notTracked: "Not tracked",
  noneYet: "None yet",
  nothingDue: "Nothing due",
  notEnough: "Not enough yet",
} as const

export type OverviewPanel = "spend" | "attention" | "ahead" | "insights"

export function spendTileValue(hasIncome: boolean, availableCents: number | null, currency: string) {
  if (!hasIncome || availableCents == null) return OVERVIEW_COPY.notTracked
  return snapshotAvailable(availableCents, currency)
}

export function attentionTileValue(rows: { urgent: boolean }[]) {
  if (rows.length === 0) return { text: OVERVIEW_COPY.noneYet, urgent: false }
  const noun = rows.length === 1 ? "bill" : "bills"
  return { text: `${rows.length} ${noun}`, urgent: rows.some((row) => row.urgent) }
}

type DueBill = {
  id: string
  name: string
  amount_cents: number
  due_on: string
  paid_at: string | null
}

/**
 * Earliest bill still owed on or after today. A past due date never wins,
 * and the same bill wins for every filter state that still includes it.
 */
export function aheadTileValue(
  bills: DueBill[],
  payments: { bill_id: string | null; amount_cents: number }[],
  today: string,
  currency: string,
) {
  let next: { date: string; amountCents: number; name: string } | null = null
  for (const bill of bills) {
    if (bill.due_on < today) continue
    const left = billAmountLeft(
      bill,
      payments.filter((payment) => payment.bill_id === bill.id),
    )
    if (left <= 0) continue
    if (next && (bill.due_on > next.date || (bill.due_on === next.date && bill.name >= next.name))) continue
    next = { date: bill.due_on, amountCents: left, name: bill.name }
  }
  if (!next) return OVERVIEW_COPY.nothingDue
  return `${formatMoney(next.amountCents, currency)} · ${formatShortDate(next.date)}`
}

export function insightsTileValue(count: number) {
  if (count <= 0) return OVERVIEW_COPY.notEnough
  const noun = count === 1 ? "note" : "notes"
  return `${count} ${noun}`
}
