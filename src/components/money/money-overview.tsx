"use client"

import { useState } from "react"

import { MoneyFlowPanel } from "@/components/money/money-flow"
import { MoneyInsightsPanel } from "@/components/money/money-insights"
import { MoneyAttentionPanel, MoneyAvailablePanel, useSafetyBuffer } from "@/components/money/money-snapshot"
import {
  buildCashFlow,
  type FlowCard,
  type FlowDays,
  type FlowGoal,
  type FlowIncome,
  type FlowPayment,
  type FlowPerson,
  type FlowSubscription,
} from "@/lib/money/flow"
import type { MoneyInsight } from "@/lib/money/insights"
import {
  OVERVIEW_COPY,
  aheadTileValue,
  attentionTileValue,
  insightsTileValue,
  spendTileValue,
  type OverviewPanel,
} from "@/lib/money/overview"
import { buildMoneySnapshot, type SnapshotBill } from "@/lib/money/snapshot"
import { cn } from "cn"

const surface = "min-w-0 rounded-[12px] border border-border bg-surface shadow-soft"

const tiles: { id: OverviewPanel; label: string }[] = [
  { id: "spend", label: OVERVIEW_COPY.spend },
  { id: "attention", label: OVERVIEW_COPY.attention },
  { id: "ahead", label: OVERVIEW_COPY.ahead },
  { id: "insights", label: OVERVIEW_COPY.insights },
]

export function MoneyOverview({
  today,
  currency,
  bills,
  payments,
  income,
  goals,
  subscriptions,
  cards,
  people,
  insights,
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
  insights: MoneyInsight[]
}) {
  const [panel, setPanel] = useState<OverviewPanel | null>(null)
  const [days, setDays] = useState<FlowDays>(30)
  const [buffer, setBuffer] = useSafetyBuffer()
  const snapshot = buildMoneySnapshot({
    today,
    bills,
    payments,
    income,
    goals,
    subscriptions,
    bufferCents: buffer,
  })
  const flow = buildCashFlow({
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
  const attention = attentionTileValue(snapshot.attention)
  const values: Record<OverviewPanel, { text: string; urgent: boolean }> = {
    spend: { text: spendTileValue(snapshot.hasIncome, snapshot.availableCents, currency), urgent: false },
    attention,
    ahead: { text: aheadTileValue(flow.events, today, currency), urgent: false },
    insights: { text: insightsTileValue(insights.length), urgent: false },
  }

  function toggle(next: OverviewPanel) {
    setPanel((current) => (current === next ? null : next))
  }

  return (
    <section data-money-overview data-open={panel ?? "closed"} className={surface} aria-labelledby="money-overview-title">
      <div className={panel ? "px-4 pt-4" : "p-4"}>
        <h2 id="money-overview-title" className="text-[13px] font-medium text-ink">
          {OVERVIEW_COPY.title}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {tiles.map((tile) => {
            const active = panel === tile.id
            const value = values[tile.id]
            return (
              <button
                key={tile.id}
                type="button"
                id={`money-overview-${tile.id}`}
                aria-pressed={active}
                aria-controls="money-overview-panel"
                onClick={() => toggle(tile.id)}
                className={cn(
                  "flex min-h-16 min-w-0 flex-col justify-center gap-0.5 rounded-[10px] px-2.5 py-2 text-left",
                  active ? "bg-brand-soft" : "bg-surface-muted",
                )}
              >
                <span className={cn("text-[13px]", active ? "font-medium text-brand-deep" : "text-muted-foreground")}>
                  {tile.label}
                </span>
                <span
                  className={cn(
                    "block w-full truncate text-[15px] font-medium tabular-nums",
                    value.urgent ? "text-danger" : "text-ink",
                  )}
                >
                  {value.text}
                </span>
              </button>
            )
          })}
        </div>
      </div>
      {panel ? (
        <div id="money-overview-panel" role="region" aria-labelledby={`money-overview-${panel}`} className="w-full p-3">
          {panel === "spend" ? <MoneyAvailablePanel model={snapshot} currency={currency} onSaveBuffer={setBuffer} /> : null}
          {panel === "attention" ? <MoneyAttentionPanel attention={snapshot.attention} currency={currency} /> : null}
          {panel === "ahead" ? <MoneyFlowPanel model={flow} currency={currency} days={days} onDays={setDays} /> : null}
          {panel === "insights" ? <MoneyInsightsPanel lines={insights} /> : null}
        </div>
      ) : null}
    </section>
  )
}
