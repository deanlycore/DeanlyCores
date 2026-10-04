import { addDays, formatMoney, monthStart, nextMonthStart } from "@/lib/home/metrics"

import { billAmountLeft, billDueCopy, daysUntil } from "@/lib/money/board"

/** Device-only. Not a database key and not shared with the household. */
export const SAFETY_BUFFER_KEY = "deanly-money-safety-buffer"

/** The snapshot row asks the open bills list to show this bill. */
export const OPEN_BILL_EVENT = "deanly-open-bill"

export const SNAPSHOT_COPY = {
  title: "Available to spend",
  window: "Left this month",
  addIncome: "Add income to see what’s left.",
  shortfall: "Bills are higher than expected income.",
  noneYet: "None yet",
  noContribution: "No contribution set.",
  attention: "Needs your attention",
  income: "Expected income",
  bills: "Upcoming bills",
  savings: "Savings",
  subscriptions: "Subscriptions",
  buffer: "Safety buffer",
} as const

const ATTENTION_CAP = 3
const ATTENTION_DAYS = 7

export type SnapshotBill = {
  id: string
  name: string
  amount_cents: number
  due_on: string
  paid_at: string | null
}

export type SnapshotPayment = {
  bill_id: string | null
  amount_cents: number
}

export type SnapshotIncome = {
  amount_cents: number
  spent_on: string
}

export type SnapshotGoal = {
  /** Monthly amount already on the goal. Missing means no contribution. */
  contribution_cents?: number | null
  /** Stored on the goal. The snapshot does not subtract either one. */
  target_cents?: number
  current_cents?: number
}

export type SnapshotSubscription = {
  amount_cents: number
  renews_on: string
  active: boolean
}

export type SnapshotAttention = {
  id: string
  name: string
  leftCents: number
  due: string
  urgent: boolean
}

export type MoneySnapshotModel = {
  hasIncome: boolean
  incomeCents: number
  hasBills: boolean
  billsCents: number
  savingsCents: number
  savingsState: "none" | "unset" | "set"
  hasSubscriptions: boolean
  subscriptionsCents: number
  bufferCents: number
  /** Null when this month has no expected income. Do not print that as $0. */
  availableCents: number | null
  shortfall: boolean
  attention: SnapshotAttention[]
}

export function snapshotMoney(cents: number, currency: string, subtract: boolean) {
  const money = formatMoney(Math.abs(cents), currency)
  return subtract ? `−${money}` : money
}

export function snapshotAvailable(cents: number, currency: string) {
  if (cents < 0) return `−${formatMoney(Math.abs(cents), currency)}`
  return formatMoney(cents, currency)
}

export function moneyBillOpenHref(pathname: string, id: string) {
  const bill = encodeURIComponent(id)
  if (pathname === "/preview/money") return `/preview/money?bill=${bill}`
  if (pathname.startsWith("/preview/money/")) return `/preview/money/bills?bill=${bill}`
  if (pathname === "/money") return `/money?bill=${bill}`
  if (pathname.startsWith("/money/")) return `/money/bills?bill=${bill}`
  return `/money?bill=${bill}`
}

function inThisMonth(date: string, today: string) {
  return date >= monthStart(today) && date < nextMonthStart(today)
}

function billLeft(bill: SnapshotBill, payments: SnapshotPayment[]) {
  return billAmountLeft(
    bill,
    payments.filter((payment) => payment.bill_id === bill.id),
  )
}

function savingsLine(goals: SnapshotGoal[]) {
  if (goals.length === 0) return { cents: 0, state: "none" as const }
  const set = goals.filter((goal) => typeof goal.contribution_cents === "number")
  if (set.length === 0) return { cents: 0, state: "unset" as const }
  return {
    cents: set.reduce((sum, goal) => sum + (goal.contribution_cents ?? 0), 0),
    state: "set" as const,
  }
}

function attentionUrgent(dueOn: string, today: string) {
  if (dueOn < today) return true
  return daysUntil(today, dueOn) <= 1
}

/**
 * Rows passed in are the ones this session can already read.
 * Expected income is still ahead of today and dated before the month ends.
 * Upcoming bills are the amount still left on unpaid bills due before the month ends.
 * A yearly subscription counts only when its renewal date is this month, at the row amount.
 */
export function buildMoneySnapshot(input: {
  today: string
  bills: SnapshotBill[]
  payments: SnapshotPayment[]
  income: SnapshotIncome[]
  goals: SnapshotGoal[]
  subscriptions: SnapshotSubscription[]
  bufferCents: number
}): MoneySnapshotModel {
  const monthEnd = nextMonthStart(input.today)
  const incomeCents = input.income
    .filter((row) => row.spent_on > input.today && row.spent_on < monthEnd)
    .reduce((sum, row) => sum + row.amount_cents, 0)
  const hasIncome = input.income.some((row) => row.spent_on > input.today && row.spent_on < monthEnd)

  const openBills = input.bills
    .map((bill) => ({ bill, left: billLeft(bill, input.payments) }))
    .filter((row) => row.left > 0)
  const dueThisMonth = openBills.filter((row) => row.bill.due_on < monthEnd)
  const billsCents = dueThisMonth.reduce((sum, row) => sum + row.left, 0)

  const renewing = input.subscriptions.filter(
    (row) => row.active && inThisMonth(row.renews_on, input.today),
  )
  const subscriptionsCents = renewing.reduce((sum, row) => sum + row.amount_cents, 0)
  const savings = savingsLine(input.goals)
  const bufferCents =
    Number.isFinite(input.bufferCents) && input.bufferCents > 0
      ? Math.min(Math.floor(input.bufferCents), 100_000_000)
      : 0

  const availableCents = hasIncome ? incomeCents - billsCents - savings.cents - subscriptionsCents - bufferCents : null

  const horizon = addDays(input.today, ATTENTION_DAYS)
  const attention = openBills
    .filter((row) => row.bill.due_on <= horizon)
    .sort((a, b) => {
      // Overdue before anything still ahead. Earliest due date leads inside each group.
      const overdue = Number(b.bill.due_on < input.today) - Number(a.bill.due_on < input.today)
      if (overdue !== 0) return overdue
      const date = a.bill.due_on.localeCompare(b.bill.due_on)
      if (date !== 0) return date
      return a.bill.name.localeCompare(b.bill.name)
    })
    .slice(0, ATTENTION_CAP)
    .map((row) => ({
      id: row.bill.id,
      name: row.bill.name,
      leftCents: row.left,
      due: billDueCopy({ paid_at: null, due_on: row.bill.due_on }, input.today).text,
      urgent: attentionUrgent(row.bill.due_on, input.today),
    }))

  return {
    hasIncome,
    incomeCents,
    hasBills: dueThisMonth.length > 0,
    billsCents,
    savingsCents: savings.cents,
    savingsState: savings.state,
    hasSubscriptions: renewing.length > 0,
    subscriptionsCents,
    bufferCents,
    availableCents,
    shortfall: availableCents != null && availableCents < 0,
    attention,
  }
}
