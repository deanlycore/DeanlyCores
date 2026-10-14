import { formatMoney, monthStart, nextMonthStart } from "@/lib/home/metrics"
import {
  billAmountLeft,
  daysUntil,
  monthlySubscriptionCents,
  personGroupLabel,
  remainingCents,
} from "@/lib/money/board"
import { placeMoneyCategory } from "@/lib/money/category-match"

export const INSIGHTS_COPY = {
  title: "Insights",
  empty: "Not enough tracked yet.",
  shortfall: "Bills are higher than expected income.",
} as const

const LINE_CAP = 3
const SOON_DAYS = 7

const SECTION_RANK = {
  bills: 0,
  income: 1,
  savings: 2,
  subscriptions: 3,
  cards: 4,
  people: 5,
} as const

type Section = keyof typeof SECTION_RANK

export type InsightPart = {
  text: string
  amount?: boolean
}

export type MoneyInsight = {
  id: "soon" | "group" | "subscriptions" | "undated" | "cover"
  parts: InsightPart[]
}

export type InsightBill = {
  id: string
  name: string
  amount_cents: number
  due_on: string | null
  paid_at: string | null
  category?: string | null
}

export type InsightIncome = {
  id: string
  name: string
  amount_cents: number
  spent_on: string
  category?: string | null
}

export type InsightGoal = {
  id: string
  name: string
  category?: string | null
  contribution_cents?: number | null
}

export type InsightSubscription = {
  id: string
  name: string
  amount_cents: number
  renews_on: string
  active: boolean
  category?: string | null
  cadence?: "month" | "year" | null
}

export type InsightCard = {
  id: string
  name: string
  amount_cents: number
  due_on: string | null
  category?: string | null
}

export type InsightPerson = {
  id: string
  name: string
  amount_cents: number
  due_on: string | null
  direction?: "owe" | "owed" | null
}

export type InsightPayment = {
  bill_id: string | null
  card_id: string | null
  person_id: string | null
  amount_cents: number
}

type Bucket = {
  section: Section
  label: string
  cents: number
}

/**
 * Rows passed in are the ones this session can already read.
 * A row left out of that list stays out of every line.
 * Lines use this month. The seven-day bill line also includes a date
 * that falls in the next month when it is still inside those seven days.
 * A yearly subscription price is not divided into the monthly line.
 */
export function buildMoneyInsights(input: {
  today: string
  currency: string
  bills: InsightBill[]
  payments: InsightPayment[]
  income: InsightIncome[]
  goals: InsightGoal[]
  subscriptions: InsightSubscription[]
  cards: InsightCard[]
  people: InsightPerson[]
}): MoneyInsight[] {
  const money = (cents: number) => formatMoney(cents, input.currency)
  const billPayments = indexPayments(input.payments, "bill_id")
  const cardPayments = indexPayments(input.payments, "card_id")
  const personPayments = indexPayments(input.payments, "person_id")
  const lines: MoneyInsight[] = []

  const soon = soonBills(input.bills, billPayments, input.today)
  if (soon.count > 0 && soon.cents > 0) {
    const verb = soon.count === 1 ? "bill is" : "bills are"
    lines.push({
      id: "soon",
      parts: [
        { text: `${soon.count} ${verb} due in the next 7 days, ` },
        { text: money(soon.cents), amount: true },
        { text: " total." },
      ],
    })
  }

  const biggest = biggestGroup({
    today: input.today,
    bills: input.bills,
    income: input.income,
    goals: input.goals,
    subscriptions: input.subscriptions,
    cards: input.cards,
    people: input.people,
    billPayments,
    cardPayments,
    personPayments,
  })
  if (biggest && biggest.cents > 0) {
    lines.push({
      id: "group",
      parts: [
        { text: `${biggest.label} is your biggest group this month, ` },
        { text: money(biggest.cents), amount: true },
        { text: "." },
      ],
    })
  }

  const subscriptionCents = monthlySubscriptionCents(input.subscriptions.filter((row) => row.active))
  if (subscriptionCents > 0) {
    lines.push({
      id: "subscriptions",
      parts: [
        { text: "Subscriptions add up to " },
        { text: money(subscriptionCents), amount: true },
        { text: " a month." },
      ],
    })
  }

  const undated = input.bills.filter((bill) => !hasDueDate(bill.due_on) && billLeft(bill, billPayments) > 0).length
  if (undated > 0) {
    const text = undated === 1 ? "1 bill doesn’t have a due date yet." : `${undated} bills don’t have a due date yet.`
    lines.push({ id: "undated", parts: [{ text }] })
  }

  const cover = coverLine(input, billPayments, money)
  if (cover) lines.push(cover)

  return lines.slice(0, LINE_CAP)
}

export function insightText(line: MoneyInsight) {
  return line.parts.map((part) => part.text).join("")
}

function soonBills(
  bills: InsightBill[],
  payments: Map<string, InsightPayment[]>,
  today: string,
) {
  let count = 0
  let cents = 0
  for (const bill of bills) {
    if (!hasDueDate(bill.due_on)) continue
    const days = daysUntil(today, bill.due_on)
    if (days < 0 || days > SOON_DAYS) continue
    const left = billLeft(bill, payments)
    if (left <= 0) continue
    count += 1
    cents += left
  }
  return { count, cents }
}

function coverLine(
  input: {
    today: string
    bills: InsightBill[]
    income: InsightIncome[]
  },
  payments: Map<string, InsightPayment[]>,
  money: (cents: number) => string,
): MoneyInsight | null {
  const monthEnd = nextMonthStart(input.today)
  let incomeCents = 0
  for (const row of input.income) {
    if (row.spent_on > input.today && row.spent_on < monthEnd) incomeCents += row.amount_cents
  }
  if (incomeCents <= 0) return null

  const monthOpen = monthStart(input.today)
  let billsCents = 0
  for (const bill of input.bills) {
    if (!hasDueDate(bill.due_on) || bill.due_on < monthOpen || bill.due_on >= monthEnd) continue
    const left = billLeft(bill, payments)
    if (left > 0) billsCents += left
  }

  if (billsCents > incomeCents) {
    return { id: "cover", parts: [{ text: INSIGHTS_COPY.shortfall }] }
  }
  const spare = incomeCents - billsCents
  if (spare <= 0) return null
  return {
    id: "cover",
    parts: [
      { text: "Income covers bills with " },
      { text: money(spare), amount: true },
      { text: " to spare." },
    ],
  }
}

function biggestGroup(input: {
  today: string
  bills: InsightBill[]
  income: InsightIncome[]
  goals: InsightGoal[]
  subscriptions: InsightSubscription[]
  cards: InsightCard[]
  people: InsightPerson[]
  billPayments: Map<string, InsightPayment[]>
  cardPayments: Map<string, InsightPayment[]>
  personPayments: Map<string, InsightPayment[]>
}) {
  const buckets = new Map<string, Bucket>()

  const add = (section: Section, label: string, cents: number) => {
    if (cents <= 0) return
    const key = `${section}\0${label}`
    const current = buckets.get(key)
    if (current) current.cents += cents
    else buckets.set(key, { section, label, cents })
  }

  for (const bill of input.bills) {
    if (!hasDueDate(bill.due_on) || !inThisMonth(bill.due_on, input.today)) continue
    add("bills", placeMoneyCategory("bills", bill.name, bill.category), billLeft(bill, input.billPayments))
  }

  for (const row of input.income) {
    if (!inThisMonth(row.spent_on, input.today)) continue
    add("income", placeMoneyCategory("income", row.name, row.category), row.amount_cents)
  }

  for (const goal of input.goals) {
    if (typeof goal.contribution_cents !== "number" || goal.contribution_cents <= 0) continue
    add("savings", placeMoneyCategory("savings", goal.name, goal.category), goal.contribution_cents)
  }

  for (const row of input.subscriptions) {
    if (!row.active || !inThisMonth(row.renews_on, input.today)) continue
    add("subscriptions", placeMoneyCategory("subscriptions", row.name, row.category), row.amount_cents)
  }

  for (const card of input.cards) {
    if (!hasDueDate(card.due_on) || !inThisMonth(card.due_on, input.today)) continue
    const left = remainingCents(card.amount_cents, input.cardPayments.get(card.id) ?? [])
    add("cards", placeMoneyCategory("cards", card.name, card.category), left)
  }

  for (const person of input.people) {
    if (!hasDueDate(person.due_on) || !inThisMonth(person.due_on, input.today)) continue
    const left = remainingCents(person.amount_cents, input.personPayments.get(person.id) ?? [])
    add("people", personGroupLabel(person.direction), left)
  }

  let best: Bucket | null = null
  for (const bucket of buckets.values()) {
    if (!best || prefers(bucket, best)) best = bucket
  }
  return best
}

function prefers(candidate: Bucket, current: Bucket) {
  if (candidate.cents !== current.cents) return candidate.cents > current.cents
  const rank = SECTION_RANK[candidate.section] - SECTION_RANK[current.section]
  if (rank !== 0) return rank < 0
  return candidate.label.localeCompare(current.label) < 0
}

function inThisMonth(date: string, today: string) {
  return date >= monthStart(today) && date < nextMonthStart(today)
}

function hasDueDate(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function billLeft(bill: InsightBill, payments: Map<string, InsightPayment[]>) {
  return billAmountLeft(bill, payments.get(bill.id) ?? [])
}

function indexPayments(payments: InsightPayment[], key: "bill_id" | "card_id" | "person_id") {
  const map = new Map<string, InsightPayment[]>()
  for (const payment of payments) {
    const id = payment[key]
    if (!id) continue
    const list = map.get(id)
    if (list) list.push(payment)
    else map.set(id, [payment])
  }
  return map
}
