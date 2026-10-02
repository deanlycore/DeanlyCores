import { addDays, billsDueThisWeek, formatMoney, formatShortDate } from "@/lib/home/metrics"
import type { Visibility } from "@/lib/visibility"

export const MONEY_COPY = {
  billsEmpty: "No bills yet. Add rent, utilities, or anything due.",
  incomeEmpty: "No income sources yet. Add a paycheck or other source.",
  savingsEmpty: "No savings goals yet. Start one when you’re ready.",
  subscriptionsEmpty: "No subscriptions tracked. Add one to see renewals here.",
  filterEmpty: "Nothing matches these filters.",
  billsPulseEmpty: "Nothing due in the next week.",
  incomePulseEmpty: "No payday coming up.",
  savingsPulseEmpty: "Goals you’re setting aside will show here.",
  subscriptionsPulseEmpty: "Nothing renews in the next month.",
  buffer: "Buffer",
} as const

export type VisibilityFilter = "all" | "shared" | "private"
export type BillChip = "due" | "overdue" | "paid"
export type PulseTone = "idle" | "soon" | "overdue" | "payday"

export type PulseCell = {
  id: string
  date: string
  day: string
  title: string
  detail: string
  tone: PulseTone
}

export type DueTone = "success" | "danger" | "warn" | "muted"

const STRIP_CAP = 7

export function moneySubtitle(
  page: "bills" | "income" | "savings" | "subscriptions",
  householdName: string | null | undefined,
) {
  const name = householdName?.trim() || "your household"
  if (page === "bills") return `What’s due for ${name}.`
  if (page === "income") return `What’s coming in for ${name}.`
  if (page === "savings") return "Goals you’re setting aside for."
  return "What renews soon."
}

export function matchesVisibility(visibility: Visibility, filter: VisibilityFilter) {
  return filter === "all" || visibility === filter
}

export function applyVisibility<T extends { visibility: Visibility }>(rows: T[], filter: VisibilityFilter) {
  if (filter === "all") return rows
  return rows.filter((row) => row.visibility === filter)
}

function sharedRank(visibility: Visibility) {
  return visibility === "shared" ? 0 : 1
}

function billBucket(bill: { paid_at: string | null; due_on: string }, today: string) {
  if (bill.paid_at) return 2
  if (bill.due_on < today) return 0
  return 1
}

/** Overdue, then upcoming, then paid. Due date leads; Shared wins when the date matches. */
export function sortBills<T extends { visibility: Visibility; due_on: string; paid_at: string | null; name: string }>(
  bills: T[],
  today: string,
) {
  return [...bills].sort((a, b) => {
    const bucket = billBucket(a, today) - billBucket(b, today)
    if (bucket !== 0) return bucket
    const date = a.due_on.localeCompare(b.due_on)
    if (date !== 0) return date
    const shared = sharedRank(a.visibility) - sharedRank(b.visibility)
    if (shared !== 0) return shared
    return a.name.localeCompare(b.name)
  })
}

export function sortSharedFirst<T extends { visibility: Visibility }>(rows: T[]) {
  return [...rows].sort((a, b) => sharedRank(a.visibility) - sharedRank(b.visibility))
}

export function sortIncome<T extends { visibility: Visibility; spent_on: string; name: string }>(rows: T[], today: string) {
  return [...rows].sort((a, b) => {
    const aUpcoming = a.spent_on >= today ? 0 : 1
    const bUpcoming = b.spent_on >= today ? 0 : 1
    if (aUpcoming !== bUpcoming) return aUpcoming - bUpcoming
    const shared = sharedRank(a.visibility) - sharedRank(b.visibility)
    if (shared !== 0) return shared
    const date = aUpcoming === 0 ? a.spent_on.localeCompare(b.spent_on) : b.spent_on.localeCompare(a.spent_on)
    if (date !== 0) return date
    return a.name.localeCompare(b.name)
  })
}

export function sortSubscriptions<
  T extends { visibility: Visibility; renews_on: string; active: boolean; name: string },
>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const active = Number(b.active) - Number(a.active)
    if (active !== 0) return active
    const date = a.renews_on.localeCompare(b.renews_on)
    if (date !== 0) return date
    const shared = sharedRank(a.visibility) - sharedRank(b.visibility)
    if (shared !== 0) return shared
    return a.name.localeCompare(b.name)
  })
}

export function daysUntil(from: string, to: string) {
  const [y1, m1, d1] = from.split("-").map(Number)
  const [y2, m2, d2] = to.split("-").map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export function billDueCopy(
  bill: { paid_at: string | null; due_on: string },
  today: string,
): { text: string; tone: DueTone } {
  if (bill.paid_at) return { text: "Paid", tone: "success" }
  if (bill.due_on < today) return { text: "Overdue", tone: "danger" }
  const days = daysUntil(today, bill.due_on)
  if (days === 0) return { text: "Due today", tone: "warn" }
  if (days <= 6) return { text: days === 1 ? "Due in 1 day" : `Due in ${days} days`, tone: "warn" }
  return { text: `Due ${formatShortDate(bill.due_on)}`, tone: "muted" }
}

export function centsInput(cents: number) {
  return (cents / 100).toFixed(2)
}

export function amountLabel(cents: number, currency: string) {
  if (cents <= 0) return "~"
  return formatMoney(cents, currency)
}

/** Calm estimate. Negative stays muted ink — the caller does not paint it as danger. */
export function bufferAmount(cents: number, currency: string) {
  const absolute = formatMoney(Math.abs(cents), currency)
  return cents < 0 ? `−${absolute}` : `~${absolute}`
}

export function billMatchesChip(
  bill: { due_on: string; paid_at: string | null },
  today: string,
  chip: BillChip | null,
) {
  if (!chip) return true
  if (chip === "overdue") return !bill.paid_at && bill.due_on < today
  if (chip === "paid") return Boolean(bill.paid_at) && bill.paid_at!.slice(0, 7) === today.slice(0, 7)
  const end = addDays(today, 6)
  return !bill.paid_at && bill.due_on >= today && bill.due_on <= end
}

export function billMetrics(
  bills: { amount_cents: number; due_on: string; paid_at: string | null }[],
  today: string,
  budgetCents: number | null,
) {
  const month = today.slice(0, 7)
  const committed = bills
    .filter((bill) => !bill.paid_at && bill.due_on.startsWith(month))
    .reduce((sum, bill) => sum + bill.amount_cents, 0)
  return {
    dueThisWeek: billsDueThisWeek(bills, today).length,
    overdue: bills.filter((bill) => !bill.paid_at && bill.due_on < today).length,
    paid: bills.filter((bill) => bill.paid_at?.slice(0, 7) === month).length,
    bufferCents: budgetCents == null ? null : budgetCents - committed,
  }
}

function dayLabel(date: string) {
  return String(Number(date.slice(8, 10)))
}

type DueInput = {
  id: string
  name: string
  amount_cents: number
  due_on: string
  paid_at: string | null
}

function cellsFromDues(bills: DueInput[], today: string, currency: string): PulseCell[] {
  const weekEnd = addDays(today, 6)
  const groups = new Map<string, DueInput[]>()
  for (const bill of bills) {
    const list = groups.get(bill.due_on)
    if (list) list.push(bill)
    else groups.set(bill.due_on, [bill])
  }
  return [...groups.entries()].map(([date, group]) => {
    const amount = group.reduce((sum, bill) => sum + bill.amount_cents, 0)
    const tone: PulseTone = date < today ? "overdue" : date <= weekEnd ? "soon" : "idle"
    return {
      id: `due-${date}`,
      date,
      day: dayLabel(date),
      title: group.length > 1 ? `${group.length} bills` : group[0].name,
      detail: amount <= 0 ? "~" : formatMoney(amount, currency),
      tone,
    }
  })
}

/**
 * Next ~14 days, widened to about 5 dues when the window is sparse.
 * Payday markers fill open slots. Overdue is a cell with danger tone, never a red fill.
 */
export function billPulseCells(
  bills: DueInput[],
  today: string,
  paydayDates: string[] = [],
  currency = "USD",
): PulseCell[] {
  const horizon = addDays(today, 13)
  const unpaid = [...bills]
    .filter((bill) => !bill.paid_at)
    .sort((a, b) => a.due_on.localeCompare(b.due_on) || a.name.localeCompare(b.name))
  const overdue = unpaid.filter((bill) => bill.due_on < today).slice(-3)
  const upcoming = unpaid.filter((bill) => bill.due_on >= today)
  const inWindow = upcoming.filter((bill) => bill.due_on <= horizon)
  const later = upcoming.filter((bill) => bill.due_on > horizon)
  const extraCount = Math.max(0, Math.min(5, inWindow.length + later.length) - inWindow.length)
  const cells = cellsFromDues([...overdue, ...inWindow, ...later.slice(0, extraCount)], today, currency)

  const spanEnd = cells.reduce((end, cell) => (cell.date > end ? cell.date : end), horizon)
  const payLimit = spanEnd > addDays(today, 30) ? spanEnd : addDays(today, 30)
  const taken = new Set(cells.map((cell) => cell.date))
  for (const date of [...new Set(paydayDates)].sort()) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > payLimit || taken.has(date)) continue
    taken.add(date)
    cells.push({
      id: `pay-${date}`,
      date,
      day: dayLabel(date),
      title: "Paid",
      detail: "day",
      tone: "payday",
    })
  }

  cells.sort((a, b) => a.date.localeCompare(b.date))
  if (cells.length <= STRIP_CAP) return cells
  const overdueCells = cells.filter((cell) => cell.tone === "overdue").slice(-2)
  const rest = cells.filter((cell) => cell.tone !== "overdue")
  return [...overdueCells, ...rest.slice(0, STRIP_CAP - overdueCells.length)].sort((a, b) =>
    a.date.localeCompare(b.date),
  )
}

export function nextPayEvents<T extends { spent_on: string; visibility: Visibility; name: string }>(rows: T[], today: string) {
  return [...rows]
    .filter((row) => row.spent_on >= today)
    .sort((a, b) => a.spent_on.localeCompare(b.spent_on) || sharedRank(a.visibility) - sharedRank(b.visibility) || a.name.localeCompare(b.name))
    .slice(0, 2)
}

export function incomeMetrics(rows: { amount_cents: number; spent_on: string }[], today: string) {
  const next = [...rows].filter((row) => row.spent_on >= today).sort((a, b) => a.spent_on.localeCompare(b.spent_on))[0]
  const month = today.slice(0, 7)
  return {
    nextDate: next?.spent_on ?? null,
    monthCents: rows.filter((row) => row.spent_on.startsWith(month)).reduce((sum, row) => sum + row.amount_cents, 0),
  }
}

/** Muted amber only when the same source has both a received and a larger expected amount this month. */
export function incomeGap(
  row: { name: string; spent_on: string },
  rows: { name: string; spent_on: string; amount_cents: number }[],
  today: string,
) {
  if (row.spent_on <= today) return null
  const month = today.slice(0, 7)
  const same = rows.filter((item) => item.name === row.name && item.spent_on.startsWith(month))
  const received = same.filter((item) => item.spent_on <= today).reduce((sum, item) => sum + item.amount_cents, 0)
  const expected = same.filter((item) => item.spent_on > today).reduce((sum, item) => sum + item.amount_cents, 0)
  if (received > 0 && expected > received) return "A bit under what’s expected."
  return null
}

export function goalPercent(currentCents: number, targetCents: number) {
  if (targetCents <= 0) return 0
  return Math.round(Math.min(currentCents / targetCents, 1) * 100)
}

export function savingsMetrics(rows: { current_cents: number }[]) {
  return {
    onTrack: rows.filter((row) => row.current_cents > 0).length,
    setAside: rows.reduce((sum, row) => sum + row.current_cents, 0),
  }
}

export function renewalPulseCells(
  rows: { id: string; name: string; amount_cents: number; renews_on: string; active: boolean }[],
  today: string,
  currency = "USD",
): PulseCell[] {
  const horizon = addDays(today, 30)
  const weekEnd = addDays(today, 6)
  const groups = new Map<string, typeof rows>()
  for (const row of [...rows].sort((a, b) => a.renews_on.localeCompare(b.renews_on) || a.name.localeCompare(b.name))) {
    if (!row.active || row.renews_on < today || row.renews_on > horizon) continue
    const list = groups.get(row.renews_on)
    if (list) list.push(row)
    else groups.set(row.renews_on, [row])
  }
  return [...groups.entries()].slice(0, STRIP_CAP).map(([date, group]) => {
    const amount = group.reduce((sum, row) => sum + row.amount_cents, 0)
    return {
      id: `renew-${date}`,
      date,
      day: dayLabel(date),
      title: group.length > 1 ? `${group.length} renewals` : group[0].name,
      detail: amount <= 0 ? "~" : formatMoney(amount, currency),
      tone: date <= weekEnd ? "soon" : "idle",
    }
  })
}

export function subscriptionMetrics(
  rows: { amount_cents: number; renews_on: string; active: boolean }[],
  today: string,
) {
  const month = today.slice(0, 7)
  const active = rows.filter((row) => row.active)
  return {
    renewing: active.filter((row) => row.renews_on.startsWith(month)).length,
    monthly: active.reduce((sum, row) => sum + row.amount_cents, 0),
  }
}
