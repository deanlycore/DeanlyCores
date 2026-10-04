import { addDays, monthStart, nextMonthStart } from "@/lib/home/metrics"
import { billAmountLeft, remainingCents } from "@/lib/money/board"
import { buildMoneySnapshot, type SnapshotBill, type SnapshotGoal, type SnapshotSubscription } from "@/lib/money/snapshot"

export const FLOW_WINDOWS = [7, 30, 90] as const

export type FlowDays = (typeof FLOW_WINDOWS)[number]

export const FLOW_COPY = {
  title: "Looking ahead",
  empty: "Not enough tracked yet.",
  today: "Where things stand",
  income: "Upcoming income",
  expenses: "Upcoming expenses",
  low: "Projected low",
  end: "Projected end",
  belowBuffer: "The low point is under the safety buffer.",
  alreadyCounted: "Some of these dates are already in what’s left this month.",
  noneYet: "None yet",
  setAside: "Set aside",
} as const

export function flowWindowCopy(days: FlowDays) {
  return `The next ${days} days.`
}

export type FlowIncome = {
  id: string
  name: string
  amount_cents: number
  spent_on: string
}

export type FlowGoal = SnapshotGoal & {
  id: string
  name: string
}

export type FlowSubscription = SnapshotSubscription & {
  id: string
  name: string
  /** Ignored for the amount. A yearly price is not split into months. */
  cadence?: "month" | "year" | null
}

export type FlowCard = {
  id: string
  name: string
  amount_cents: number
  due_on: string | null
}

export type FlowPerson = {
  id: string
  name: string
  amount_cents: number
  due_on: string | null
  /** owe is money out. owed is money in. Missing stays owe. */
  direction?: "owe" | "owed" | null
}

export type FlowPayment = {
  bill_id: string | null
  card_id: string | null
  person_id: string | null
  amount_cents: number
}

export type CashFlowEvent = {
  id: string
  name: string
  /** Null when the row has no date. Savings contributions are set aside, not assigned a day. */
  date: string | null
  amountCents: number
  direction: "in" | "out"
}

export type CashFlowModel = {
  empty: boolean
  days: FlowDays
  /** The snapshot’s available to spend. Null when this month has no expected income. */
  todayCents: number | null
  incomeCents: number
  expenseCents: number
  lowCents: number | null
  endCents: number | null
  belowBuffer: boolean
  /** True when a listed date is already inside this month’s available to spend. */
  alreadyCounted: boolean
  events: CashFlowEvent[]
}

type Draft = CashFlowEvent & { inSnapshot: boolean }

/**
 * Rows passed in are the ones this session can already read.
 * A Just me row left out of that list stays out of every line and every total.
 * Where things stand is the snapshot’s available to spend.
 * Dated rows already inside that number are listed on their dates and are not applied again.
 * A subscription uses its row amount on its renewal date. A yearly price is not divided.
 */
export function buildCashFlow(input: {
  today: string
  days: FlowDays
  bufferCents: number
  bills: SnapshotBill[]
  payments: FlowPayment[]
  income: FlowIncome[]
  goals: FlowGoal[]
  subscriptions: FlowSubscription[]
  cards: FlowCard[]
  people: FlowPerson[]
}): CashFlowModel {
  const end = addDays(input.today, input.days)
  const monthEnd = nextMonthStart(input.today)
  const monthOpen = monthStart(input.today)
  const events: Draft[] = []

  for (const row of input.income) {
    if (row.spent_on <= input.today || row.spent_on > end) continue
    events.push({
      id: `income:${row.id}`,
      name: row.name,
      date: row.spent_on,
      amountCents: row.amount_cents,
      direction: "in",
      inSnapshot: row.spent_on < monthEnd,
    })
  }

  for (const bill of input.bills) {
    const left = billAmountLeft(
      bill,
      input.payments.filter((payment) => payment.bill_id === bill.id),
    )
    if (left <= 0 || bill.due_on > end) continue
    events.push({
      id: `bill:${bill.id}`,
      name: bill.name,
      date: bill.due_on,
      amountCents: left,
      direction: "out",
      inSnapshot: bill.due_on < monthEnd,
    })
  }

  for (const row of input.subscriptions) {
    if (!row.active || row.renews_on < input.today || row.renews_on > end) continue
    events.push({
      id: `sub:${row.id}`,
      name: row.name,
      date: row.renews_on,
      amountCents: row.amount_cents,
      direction: "out",
      inSnapshot: row.renews_on >= monthOpen && row.renews_on < monthEnd,
    })
  }

  for (const card of input.cards) {
    if (!card.due_on || card.due_on > end) continue
    const left = remainingCents(
      card.amount_cents,
      input.payments.filter((payment) => payment.card_id === card.id),
    )
    if (left <= 0) continue
    events.push({
      id: `card:${card.id}`,
      name: card.name,
      date: card.due_on,
      amountCents: left,
      direction: "out",
      inSnapshot: false,
    })
  }

  for (const person of input.people) {
    if (!person.due_on || person.due_on > end) continue
    const left = remainingCents(
      person.amount_cents,
      input.payments.filter((payment) => payment.person_id === person.id),
    )
    if (left <= 0) continue
    events.push({
      id: `person:${person.id}`,
      name: person.name,
      date: person.due_on,
      amountCents: left,
      direction: person.direction === "owed" ? "in" : "out",
      inSnapshot: false,
    })
  }

  for (const goal of input.goals) {
    if (typeof goal.contribution_cents !== "number" || goal.contribution_cents <= 0) continue
    events.push({
      id: `goal:${goal.id}`,
      name: goal.name,
      date: null,
      amountCents: goal.contribution_cents,
      direction: "out",
      inSnapshot: true,
    })
  }

  const snapshot = buildMoneySnapshot({
    today: input.today,
    bills: input.bills,
    payments: input.payments,
    income: input.income,
    goals: input.goals,
    subscriptions: input.subscriptions,
    bufferCents: input.bufferCents,
  })

  const ordered = sortEvents(events)
  const incomeCents = ordered.filter((row) => row.direction === "in").reduce((sum, row) => sum + row.amountCents, 0)
  const expenseCents = ordered.filter((row) => row.direction === "out").reduce((sum, row) => sum + row.amountCents, 0)
  const windowIncome = ordered.some((row) => row.direction === "in")
  const windowDue = ordered.some((row) => row.direction === "out")
  const empty = !snapshot.hasIncome && !windowIncome && !windowDue

  let lowCents: number | null = null
  let endCents: number | null = null
  if (snapshot.availableCents != null) {
    let running = snapshot.availableCents
    for (const row of ordered) {
      if (!row.inSnapshot) continue
      running += row.direction === "in" ? -row.amountCents : row.amountCents
    }
    let low = snapshot.availableCents
    for (const row of ordered) {
      running += row.direction === "in" ? row.amountCents : -row.amountCents
      if (running < low) low = running
    }
    lowCents = low
    endCents = running
  }

  return {
    empty,
    days: input.days,
    todayCents: snapshot.availableCents,
    incomeCents,
    expenseCents,
    lowCents,
    endCents,
    belowBuffer: lowCents != null && snapshot.bufferCents > 0 && lowCents < snapshot.bufferCents,
    alreadyCounted: snapshot.availableCents != null && ordered.some((row) => row.inSnapshot),
    events: ordered.map((row) => ({
      id: row.id,
      name: row.name,
      date: row.date,
      amountCents: row.amountCents,
      direction: row.direction,
    })),
  }
}

function sortEvents(events: Draft[]) {
  return [...events].sort((a, b) => {
    if (a.date == null && b.date != null) return -1
    if (a.date != null && b.date == null) return 1
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date)
    if (a.direction !== b.direction) return a.direction === "out" ? -1 : 1
    const name = a.name.localeCompare(b.name)
    if (name !== 0) return name
    return a.id.localeCompare(b.id)
  })
}
