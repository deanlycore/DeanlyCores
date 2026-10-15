import { formatShortDate } from "@/lib/home/metrics"
import { FLOW_COPY, FLOW_WINDOWS, flowWindowCopy, type CashFlowModel, type FlowDays } from "@/lib/money/flow"
import { SNAPSHOT_COPY, snapshotAvailable, snapshotMoney } from "@/lib/money/snapshot"
import { cn } from "cn"

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

export function MoneyFlowPanel({
  model,
  currency,
  days,
  onDays,
}: {
  model: CashFlowModel
  currency: string
  days: FlowDays
  onDays: (days: FlowDays) => void
}) {
  return (
    <div data-money-flow>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">{flowWindowCopy(days)}</p>
        <div role="radiogroup" aria-label="How far ahead" className="inline-flex max-w-full rounded-full border border-border bg-surface p-0.5">
          {FLOW_WINDOWS.map((option) => {
            const selected = days === option
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onDays(option)}
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
      </div>
      {model.empty ? <p className="mt-3 text-[15px] font-medium text-ink">{FLOW_COPY.empty}</p> : null}
      {!model.empty ? (
        <>
          <h3 className="mt-4 text-[13px] font-normal text-muted-foreground">{FLOW_COPY.today}</h3>
          <p
            data-flow-today
            className={
              model.todayCents != null
                ? "mt-1 overflow-visible font-display text-[22px] font-semibold leading-normal tabular-nums tracking-[-0.02em] text-ink md:text-[24px]"
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
      ) : null}
    </div>
  )
}
