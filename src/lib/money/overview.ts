import { formatMoney, formatShortDate } from "@/lib/home/metrics"
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

/** Soonest upcoming money-out date already in the looking-ahead list. */
export function aheadTileValue(
  events: { date: string | null; amountCents: number; direction: "in" | "out" }[],
  today: string,
  currency: string,
) {
  let next: { date: string; amountCents: number } | null = null
  for (const event of events) {
    if (event.direction !== "out" || event.date == null || event.date < today) continue
    if (next && event.date >= next.date) continue
    next = { date: event.date, amountCents: event.amountCents }
  }
  if (!next) return OVERVIEW_COPY.nothingDue
  return `${formatMoney(next.amountCents, currency)} · ${formatShortDate(next.date)}`
}

export function insightsTileValue(count: number) {
  if (count <= 0) return OVERVIEW_COPY.notEnough
  const noun = count === 1 ? "note" : "notes"
  return `${count} ${noun}`
}
