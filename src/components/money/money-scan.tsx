"use client"

import { useState } from "react"

import { PhoneFabClearance } from "@/components/life/life-chrome"
import { CardsBoard, PeopleBoard } from "@/components/money/balance-board"
import { BillsBoard } from "@/components/money/bills-board"
import { IncomeBoard } from "@/components/money/income-board"
import { VisibilityFilter, type MoneyVisibility } from "@/components/money/money-chrome"
import { SavingsBoard } from "@/components/money/savings-board"
import { SubscriptionsBoard } from "@/components/money/subscriptions-board"
import type { BillRow, ExpenseRow, GoalRow, MoneyCardRow, MoneyPaymentRow, MoneyPersonRow, SubscriptionRow } from "@/lib/data/home"
import type { MoneyScanSection } from "@/lib/money/board"

export function MoneyScan({
  section = "bills",
  today,
  currency,
  bills,
  billsError,
  income,
  incomeError,
  goals,
  goalsError,
  subscriptions,
  subscriptionsError,
  cards,
  people,
  payments,
  cardsError,
  peopleError,
}: {
  today: string
  currency: string
  bills: BillRow[]
  billsError?: boolean
  income: ExpenseRow[]
  incomeError?: boolean
  goals: GoalRow[]
  goalsError?: boolean
  subscriptions: SubscriptionRow[]
  subscriptionsError?: boolean
  cards: MoneyCardRow[]
  people: MoneyPersonRow[]
  payments: MoneyPaymentRow[]
  cardsError?: boolean
  peopleError?: boolean
  section?: MoneyScanSection
}) {
  const [filter, setFilter] = useState<MoneyVisibility>("all")

  return (
    <div className="grid gap-4 md:gap-5">
      <header>
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink md:text-[28px]">Money</h1>
        <div className="mt-3">
          <VisibilityFilter value={filter} onChange={setFilter} phoneTouch />
        </div>
      </header>
      {section === "bills" ? (
        <BillsBoard scan scanFilter={filter} rows={bills} payments={payments} currency={currency} today={today} error={billsError} />
      ) : null}
      {section === "income" ? (
        <IncomeBoard scan scanFilter={filter} rows={income} currency={currency} today={today} error={incomeError} />
      ) : null}
      {section === "savings" ? (
        <SavingsBoard scan scanFilter={filter} rows={goals} currency={currency} today={today} error={goalsError} />
      ) : null}
      {section === "subscriptions" ? (
        <SubscriptionsBoard
          scan
          scanFilter={filter}
          rows={subscriptions}
          currency={currency}
          today={today}
          error={subscriptionsError}
        />
      ) : null}
      {section === "cards" ? (
        <CardsBoard scan scanFilter={filter} rows={cards} payments={payments} currency={currency} today={today} error={cardsError} />
      ) : null}
      {section === "people" ? (
        <PeopleBoard scan scanFilter={filter} rows={people} payments={payments} currency={currency} today={today} error={peopleError} />
      ) : null}
      <PhoneFabClearance />
    </div>
  )
}
