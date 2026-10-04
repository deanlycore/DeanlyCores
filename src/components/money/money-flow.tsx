"use client"

import { useState } from "react"

import { formatShortDate } from "@/lib/home/metrics"
import {
  FLOW_COPY,
  FLOW_WINDOWS,
  buildCashFlow,
  flowWindowCopy,
  type FlowCard,
  type FlowDays,
  type FlowGoal,
  type FlowIncome,
  type FlowPayment,
  type FlowPerson,
  type FlowSubscription,
} from "@/lib/money/flow"
import { SNAPSHOT_COPY, snapshotAvailable, snapshotMoney, type SnapshotBill } from "@/lib/money/snapshot"
import { useSafetyBuffer } from "@/components/money/money-snapshot"
import { cn } from "cn"

const surface = "min-w-0 rounded-[12px] border border-border bg-surface p-4 shadow-soft"

function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-ink">{label}</span>
      <span className="text-right tabular-nums text-muted-foreground">{children}</span>
    </li>
  )
}

function moneyOrNone(cents: number, currency: string, subtract: boolean) {
  if (cents <= 0) return FLOW_COPY.noneYet
  return snapshotMoney(cents, currency, subtract)
}

export function MoneyFlow({
  today,
  currency,
  bills,
  payments,
  income,
  goals,
  subscriptions,
  cards,
  people,
}: {
  today: string
  currency: string
  bills: SnapshotBill[]
  payments: FlowPayment[]
  income: FlowIncome[]
  goals: FlowGoal[]
  subscriptions: FlowSubscription[]
  cards: FlowCard[]
  people: FlowPerson[]
}) {
  const [buffer] = useSafetyBuffer()
  const [days, setDays] = useState<FlowDays>(30)
  const model = buildCashFlow({
    today,
    days,
    bufferCents: buffer,
    bills,
    payments,
    income,
    goals,
    subscriptions,
    cards,
    people,
  })

  return (
    <section data-money-flow className={surface} aria-labelledby="money-flow-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="money-flow-title" className="text-[13px] font-medium text-ink">
            {FLOW_COPY.title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{flowWindowCopy(days)}</p>
        </div>
        <div role="radiogroup" aria-label="How far ahead" className="inline-flex max-w-full rounded-full border border-border bg-surface p-0.5">
          {FLOW_WINDOWS.map((option) => {
            const selected = days === option
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setDays(option)}
                className={cn(
                  "h-8 rounded-full px-3 text-[13px] font-medium",
                  selected ? "bg-brand-soft text-on-brand-soft" : "text-muted-foreground",
                )}
              >
                {option} days
              </button>
            )
          })}
        </div>
      </header>
      {model.empty ? (
        <p className="mt-3 text-[15px] font-medium text-ink">{FLOW_COPY.empty}</p>
      ) : (
        <>
          <h3 className="mt-4 text-[13px] font-normal text-muted-foreground">{FLOW_COPY.today}</h3>
          <p
            data-flow-today
            className={
              model.todayCents != null
                ? "mt-1 font-display text-[22px] font-semibold leading-tight tabular-nums tracking-[-0.02em] text-ink md:text-[24px]"
                : "mt-1 text-[15px] font-medium text-ink"
            }
          >
            {model.todayCents != null ? snapshotAvailable(model.todayCents, currency) : SNAPSHOT_COPY.addIncome}
          </p>
          <ul className="mt-3 grid gap-1.5">
            <Line label={FLOW_COPY.income}>{moneyOrNone(model.incomeCents, currency, false)}</Line>
            <Line label={FLOW_COPY.expenses}>{moneyOrNone(model.expenseCents, currency, true)}</Line>
            {model.lowCents != null ? (
              <Line label={FLOW_COPY.low}>
                <span data-flow-low className="text-ink">
                  {snapshotAvailable(model.lowCents, currency)}
                </span>
              </Line>
            ) : null}
            {model.endCents != null ? (
              <Line label={FLOW_COPY.end}>
                <span data-flow-end className="text-ink">
                  {snapshotAvailable(model.endCents, currency)}
                </span>
              </Line>
            ) : null}
          </ul>
          {model.alreadyCounted ? <p className="mt-3 text-sm text-muted-foreground">{FLOW_COPY.alreadyCounted}</p> : null}
          {model.belowBuffer ? <p className="mt-3 text-sm text-ink">{FLOW_COPY.belowBuffer}</p> : null}
          {model.events.length > 0 ? (
            <ol className="mt-3 grid">
              {model.events.map((event) => (
                <li key={event.id} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                  <span className="min-w-0 truncate font-medium text-ink">{event.name}</span>
                  <span className="shrink-0 tabular-nums text-ink">
                    {snapshotMoney(event.amountCents, currency, event.direction === "out")}
                  </span>
                  <span className="ml-auto text-[13px] tabular-nums text-muted-foreground">
                    {event.date ? formatShortDate(event.date) : FLOW_COPY.setAside}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      )}
    </section>
  )
}
